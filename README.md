# ZSHIRTS

A T-shirt that carries an encrypted message on the Zcash blockchain. The page that decodes it
holds most of a viewing key. The shirt holds the last 16 characters. Type them in, and the
message is decrypted on your own phone.

Live page: **https://key-inside.vercel.app** (an alternative design is at `/raw.html`).
It's on **testnet** for now.

## How it works

1. **The message is on the chain, encrypted.** Someone sent a small shielded Zcash payment
   to the shirt's address, with a memo. The memo is stored encrypted inside that transaction.
   The characters printed on the shirt are those encrypted bytes, two hex characters per letter.
2. **A viewing key can read it.** A Zcash *viewing key* can see what an address received,
   but it can never spend. Sharing it is like letting someone read your mail, not open your wallet.
3. **The key is split.** The page (`shirt.json`) holds the viewing key with 16 characters
   missing. The shirt holds those 16 characters.
4. **You complete it, your phone decrypts it.** `bech32m.mjs` puts your 16 characters into the
   gap and checks the key's built-in checksum. A single typo gets fixed; anything worse is rejected.
   Then the decryptor (`zcash_wasm.js`) trial-decrypts the transaction embedded in `shirt.json`,
   finds the note sent to the shirt's address, and decrypts its memo. All of this happens in the
   browser. Nothing you type is sent anywhere.

Viewing keys are Bech32m-encoded (ZIP 316) and F4Jumbled before encoding, so the 16
characters aren't one particular "part" of the key. The page needs every character.

## What's in the repo

| File | What it does |
| --- | --- |
| `index.html` | The page (basic design). `raw.html` is the same page in another design. |
| `shirt.json` | Public settings: network, txid, the embedded raw transaction, the memo's encrypted bytes, and the key **with its 16-character gap** (`key.head`, `key.tail`). |
| `bech32m.mjs` | Bech32m checks: completes the key from the head, your 16 characters and the tail, and fixes a single typo. |
| `tee.js` | Draws the shirt's chest print from the encrypted bytes. It never receives the missing characters, only what you've typed. |
| `zcash_wasm.js`, `zcash_wasm_bg.wasm` | The decryptor, from the open-source [CipherScan](https://github.com/Kenbak/cipherscan) explorer (MIT). |
| `fonts/` | JetBrains Mono (OFL), used by `raw.html`. |
| `tools/split.mjs` | Splits a viewing key: writes the head and tail to `shirt.json`, the full key to `shirt.private.json`. |
| `tools/test.mjs` | Checks the settings end to end: the key completes, the embedded transaction is the real one, the memo decrypts. |
| `tools/bech32m.test.mjs` | Unit tests for `bech32m.mjs`. |
| `tools/compare-live.mjs` | Checks that the live site serves exactly the files in your checkout. |
| `tools/make_qr.py` | Makes a print-ready QR code. |

## Run it yourself

You need Node 18+ and Python 3 (any static file server works).

```sh
git clone https://github.com/sacha-l/zshirts.git
cd zshirts
python3 -m http.server 8000
```

Open http://localhost:8000 and type the 16 characters from the shirt.

Run the tests (no private files needed):

```sh
node tools/bech32m.test.mjs                                   # checksum and typo handling
node tools/test.mjs --piece "XXXX XXXX XXXX XXXX"             # the 16 characters from the shirt
```

`test.mjs` completes the key, checks that the embedded transaction matches the chain for
`txid`, decrypts the memo and prints it, and checks that a wrong piece is rejected and a typo is
fixed. Without the owner's private file it has no expected memo to compare against, so it warns
about that and leaves the check to you.

## Check that the live site runs this code

```sh
node tools/compare-live.mjs                     # compares every served file's SHA-256 with your checkout
```

You can also decrypt the message without this page at all: in the page's "Check it yourself"
section, copy the transaction ID and the completed viewing key into an independent decrypt tool
(e.g. [testnet.zecblock.com/decrypt](https://testnet.zecblock.com/decrypt)).

## Make your own shirt

1. Create a wallet with an Orchard address, ideally on an offline machine, and export its
   unified full viewing key (UFVK). Never put a recovery phrase in this repo.
2. Send a shielded memo to that address. Wait for a confirmation.
3. Put `network`, `txid`, `ufvk` and `expectedMemo` in `shirt.json`, then run
   `node tools/test.mjs --save`. That embeds the raw transaction so the page needs no API.
4. Set `memoCiphertext` to the memo's encrypted bytes, as hex. These are what the shirt prints
   and the page draws. `test.mjs` checks they occur exactly once in the transaction.
5. Run `node tools/split.mjs`, or `--start <n>` to pick the window; the page says "the last
   16", which is `--start` = data length − 16. This moves the full key into `shirt.private.json`
   and leaves only the head and tail in `shirt.json`. **`shirt.private.json` is gitignored and
   never deployed.**
6. Run `node tools/test.mjs` (with the private file it checks everything, including the memo),
   then deploy the folder as a static site. `.vercelignore` is a whitelist of the page files.

## Security notes

- **Why 16 characters.** The Bech32m checksum is linear, so it gives away 30 bits of whatever is
  hidden: hiding *k* characters leaves 2^(5k − 30) possible keys. At 16 that is 2^50. Don't hide fewer.
- **What the viewing key can do.** It reveals what the shirt's address received, and nothing
  else. It can't spend, and it doesn't touch any other wallet.
- **What's public.** Everything in this repo and on the page is public by design, including the
  key minus its 16 characters. The full key, the 16 characters and the memo text live only in the
  owner's `shirt.private.json`.
- **Print rule.** The 16 characters must print exactly: uppercase, grouped in fours, in a typeface
  that keeps 0/O, 2/Z, 5/S, 6/G and 8/B distinct. The page reads a typed O as 0 and B as 8.

## Licence

The code in this repo is MIT licensed (see `LICENSE`). Bundled third-party files keep their own
licences: the CipherScan decryptor (MIT, `LICENSE-cipherscan.txt`) and JetBrains Mono (SIL Open
Font License 1.1, `fonts/LICENSE.txt`).
