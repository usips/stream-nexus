use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{Read, Write};

use anyhow::{anyhow, Result};
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use tracing::{error, warn};

const RATES_URL: &str = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

pub struct ExchangeRates {
    rates: HashMap<String, f64>,
}

impl ExchangeRates {
    pub fn get_usd(&self, currency: &str, amount: &f64) -> f64 {
        // Probably a bit quicker.
        if currency == "USD" {
            return *amount;
        }

        match self.rates.get(currency) {
            // Note: Rates are stored as (XYZ->USD), not (USD->XYZ).
            Some(rate) => amount * rate,
            None => {
                warn!(currency = %currency, "Exchange rate not found");
                0.0
            }
        }
    }
}

fn parse_xml(body: &str) -> Result<ExchangeRates> {
    let mut rates = HashMap::new();

    let mut buf = Vec::new();
    let mut r = Reader::from_str(body);

    loop {
        match r.read_event_into(&mut buf) {
            Ok(Event::Eof) => break,
            Ok(Event::Empty(e)) => match e.name().as_ref() {
                "Cube" => {
                    let mut c = String::new();
                    let mut v = String::new();

                    for a in e.attributes().into_iter() {
                        let attr = a.unwrap();

                        match attr.key.as_ref() {
                            "currency" => c = attr.value.into_owned(),
                            "rate" => v = attr.value.into_owned(),
                            _ => (),
                        }
                    }
                    assert_ne!(c, v);

                    let rate: f64 = v.parse()?;
                    rates.insert(c, rate);
                }
                _ => (),
            },
            Err(e) => return Err(anyhow!(e)),
            _ => (),
        }
    }

    assert_ne!(rates.len(), 0);
    rates.insert(String::from("EUR"), 1.0);
    // Static EUR->RUB rate taken on 2025-01-28.
    rates.insert(String::from("RUB"), 102.57);

    // Convert rates to be relative to USD.
    // Helps reduce repetitive arithmetic down the line.
    let usd = *(rates.get("USD").unwrap());
    rates.remove("USD");
    for (_, v) in rates.iter_mut() {
        // (EUR->USD) / (EUR->XYZ) == (XYZ->USD)
        *v = usd / *v;
    }
    // $1 USD == $1 USD. Redundant placeholder for safety.
    rates.insert(String::from("USD"), 1.0);

    // Platform-specific virtual currencies (inserted after USD normalization).
    // Kick.com: 100 Kicks = $1.09, so 1 Kick ≈ $0.01 USD.
    rates.insert(String::from("KICKS"), 0.01);

    Ok(ExchangeRates { rates })
}

pub async fn fetch_exchange_rates() -> Result<ExchangeRates> {
    let mut f = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open("exchange_rates.xml")
        .expect("Failed to open exchange rates backup file.");

    // Send an HTTP GET request to the URL
    let response = reqwest::get(RATES_URL).await?;

    // Check if the request was successful
    if response.status().is_success() {
        let text = response.text().await?;
        // Check for XML subject text.
        if text.contains("Reference rates") {
            // Parses the XML response into an ExchangeRates.
            match parse_xml(&text) {
                Ok(r) => {
                    f.write_all(text.as_bytes())
                        .expect("Failed to write exchange write backup to file.");
                    return Ok(r);
                }
                Err(_) => (),
            }
        }
    }

    error!("Failed to fetch exchange rates, using cached data");
    let mut text = String::new();
    f.read_to_string(&mut text)?;
    parse_xml(&text)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
    <gesmes:subject>Reference rates</gesmes:subject>
    <Cube>
        <Cube time="2026-11-11">
            <Cube currency="USD" rate="1.2000"/>
            <Cube currency="GBP" rate="0.8000"/>
        </Cube>
    </Cube>
</gesmes:Envelope>"#;

    #[test]
    fn parses_ecb_rates_relative_to_usd() {
        let r = parse_xml(SAMPLE).unwrap();
        assert_eq!(r.get_usd("USD", &5.0), 5.0);
        // 1 EUR = 1.2 USD
        assert!((r.get_usd("EUR", &1.0) - 1.2).abs() < 1e-9);
        // 1 GBP = 1.2 / 0.8 USD
        assert!((r.get_usd("GBP", &1.0) - 1.5).abs() < 1e-9);
        assert_eq!(r.get_usd("XYZ", &1.0), 0.0);
    }
}
