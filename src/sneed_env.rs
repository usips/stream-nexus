use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;

pub fn get_env() {
    let env_map = HashMap::from([
        ("RUST_DEBUG", "1"),
        ("RUST_BACKTRACE", "1"),
        ("RUST_LOG", "debug"),
        ("SERVER_IP", "127.0.0.1"),
        ("SERVER_PORT", "1350"),
    ]);

    let mut f = OpenOptions::new()
        // Create .env if it doesn't exist.
        .create(true)
        // append(true) implies write(true) as of rust 1.8.0
        .append(true)
        .open(".env")
        .expect("Failed to open .env file for writing.");

    // Append any missing var definitions to .env file.
    let mut modified = false;
    for (k, v) in env_map.into_iter() {
        match dotenvy::var(k) {
            Ok(_) => (),
            Err(_) => {
                // Note: Using eprintln! here since tracing isn't initialized yet
                eprintln!("[WARN] .env missing {k}, adding default value");
                writeln!(f, "{k}={v}").expect("Failed to write new pair to .env file.");
                modified = true;
            }
        }
    }

    // Open .env again if modified above.
    if modified {
        dotenvy::dotenv().expect("Failed to re-read .env file");
    }
}
