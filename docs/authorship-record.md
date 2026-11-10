# The authorship record file

Version 1, 10 November 2026. Vlo makes this file in Export, with Download the record. The check page at `/verify` runs these steps in the browser (`src/features/authorship/verify.ts`). With this page and the script below, anyone can check a record with no Vlo code.

## What the file holds

The file is JSON with no spaces: `{"format":"vlo-authorship-record","version":1,"entries":[...]}`. Each entry holds the counts of some minutes of writing on one device:

| Field                               | Value                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `device`                            | The SHA-256 of the device's public key, as 64 lowercase hex digits.                                                 |
| `seq`                               | The number of the entry in its device's chain, from 0.                                                              |
| `at`                                | The time of the entry, in milliseconds since 1970, from the device's clock.                                         |
| `minutes`                           | The minutes with a change.                                                                                          |
| `typed`, `pasted`, `dictated`, `ai` | The characters that came in from each source. A paste and a drop count as `pasted`.                                 |
| `deleted`                           | The characters that the writer removed.                                                                             |
| `words`                             | The words of the whole project at that time.                                                                        |
| `prev`                              | The `hash` of the entry before in the same chain, or `""` in the first entry.                                       |
| `hash`                              | The SHA-256 of the signed text, as 64 lowercase hex digits.                                                         |
| `sig`                               | The ECDSA P-256 signature of the signed text with SHA-256: `r` and `s`, 32 bytes each, as 128 lowercase hex digits. |
| `key`                               | Only in the first entry of a chain: the public key as JWK, `{"crv":"P-256","kty":"EC","x":...,"y":...}`.            |

The entries of one device and one project make one chain. The file lists each chain in order, first entry first. The file holds no text, no titles and no project id, so a copy of a project gives a record that still passes.

## The steps of the check

1. For the first entry of each chain, take the text `{"crv":"P-256","kty":"EC","x":"<x>","y":"<y>"}` of its key, in that order with no spaces. Its SHA-256 must equal `device`.
2. For each entry, `seq` must be the next number of its chain, and `prev` must equal the `hash` of the entry before in the chain.
3. Make the signed text: the JSON array `["vlo-authorship-record/1",device,seq,at,minutes,typed,pasted,dictated,ai,deleted,words,prev]`, with no spaces. Its SHA-256 must equal `hash`.
4. The signature `sig` must verify the signed text with the key of the chain.

A change of one entry breaks its hash or its signature. A removed or moved entry breaks the chain. The Vlo page also refuses a field that is extra, missing or of a wrong type, so a change of any one byte of the file fails.

## Check a record with Python and OpenSSL

The script uses the Python standard library and the `openssl` command. OpenSSL needs the key and the signature in DER form, so the script converts them. Run `python3 check.py "<file>"`.

```python
import base64, hashlib, json, os, subprocess, sys, tempfile

# The DER header of a P-256 public key. The point (0x04, x, y) follows it.
SPKI = bytes.fromhex("3059301306072a8648ce3d020106082a8648ce3d030107034200")
compact = {"separators": (",", ":")}

def b64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

def der_int(b):
    b = b.lstrip(b"\0") or b"\0"
    return b"\x02" + bytes([len(b) + (b[0] >> 7)]) + b"\0" * (b[0] >> 7) + b

def der_sig(hexsig):
    raw = bytes.fromhex(hexsig)
    body = der_int(raw[:32]) + der_int(raw[32:])
    return b"\x30" + bytes([len(body)]) + body

record = json.load(open(sys.argv[1]))
assert record["format"] == "vlo-authorship-record" and record["version"] == 1, "not a record"
chains = {}
for n, e in enumerate(record["entries"], 1):
    if "key" in e:
        k = e["key"]
        key_text = json.dumps({"crv": k["crv"], "kty": k["kty"], "x": k["x"], "y": k["y"]}, **compact)
        assert e["device"] not in chains, f"entry {n}: a second chain"
        assert hashlib.sha256(key_text.encode()).hexdigest() == e["device"], f"entry {n}: key"
        chains[e["device"]] = {"key": SPKI + b"\x04" + b64(k["x"]) + b64(k["y"]), "next": 0, "prev": ""}
    chain = chains[e["device"]]
    assert e["seq"] == chain["next"] and e["prev"] == chain["prev"], f"entry {n}: chain"
    fields = ["device", "seq", "at", "minutes", "typed", "pasted", "dictated", "ai", "deleted", "words", "prev"]
    text = json.dumps(["vlo-authorship-record/1"] + [e[f] for f in fields], **compact).encode()
    assert hashlib.sha256(text).hexdigest() == e["hash"], f"entry {n}: hash"
    with tempfile.TemporaryDirectory() as d:
        for name, data in (("key.der", chain["key"]), ("sig.der", der_sig(e["sig"])), ("text", text)):
            with open(os.path.join(d, name), "wb") as f:
                f.write(data)
        result = subprocess.run(["openssl", "dgst", "-sha256", "-keyform", "DER", "-verify", f"{d}/key.der",
                                 "-signature", f"{d}/sig.der", f"{d}/text"], capture_output=True)
        assert result.returncode == 0, f"entry {n}: signature"
    chain["next"] += 1
    chain["prev"] = e["hash"]
print("The record passes the check.")
```

This script checks steps 1 to 4 only. It does not refuse extra fields or spaces, as the Vlo page does.

## What the check proves and does not prove

The check proves that no one changed, removed or moved an entry after a device signed it, and it shows which keys signed. It does not show who sat at the device, or where typed words came from. The times come from each device's own clock. A writer can also write in another app, so the record can be incomplete.
