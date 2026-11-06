# The app's signing key

Every Unrot APK has to be signed with the same key, or a new version can't
install over the old one: Android would make you uninstall first, which erases
what the app saved on the phone.

The key is **not** in this repository, since anyone holding it could sign apps
that pass as Unrot. It lives only in the `UNROT_SIGNING_KEY` repository secret
(Settings › Secrets and variables › Actions): a PKCS#12 keystore, in base64,
with the alias `unrot` and the password `unrot-signing`. The password is not a
secret. The whole file is.

- With the secret, CI signs every APK with it, so updates install over the app
  and keep its data.
- Without it, CI signs with a one-off key and warns that the APK can't update an
  installed app.

`unrot-signing.sha256` is the SHA-256 fingerprint of the key's certificate,
which is public (any APK shows it). CI prints the fingerprint of every APK it
builds and fails if the secret is set but the APK was signed with anything else.

**If the secret is ever lost**, make a new key, put it in the secret, and
update the fingerprint:

```bash
keytool -genkeypair -keystore unrot-signing.p12 -storetype PKCS12 -alias unrot \
  -keyalg RSA -keysize 2048 -validity 10950 -dname "CN=Unrot" -storepass unrot-signing
base64 -w 0 unrot-signing.p12   # the secret's value
keytool -list -v -keystore unrot-signing.p12 -storepass unrot-signing | sed -n 's/.*SHA256: //p' | tr -d ':' | tr 'A-F' 'a-f' > unrot-signing.sha256
```

Phones with the old key then need one last uninstall. Back up first
(Settings › Your data › Backup and restore) and restore after.
