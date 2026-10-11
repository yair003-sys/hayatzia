# היציע: rules for working on this project

## Always keep local and production data apart
- Production Firebase (project `hayatzia-2b0ff`) is used **only** by the live site at `https://yair003-sys.github.io/hayatzia/`. The `ENV` switch in `index.html` enforces this: `prod` only on that exact hostname.
- Local development and tests run with `?emu=1` on `localhost`, which uses the `demo-hayatzia` project and the Firebase emulators (Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8080`). A `demo-` project can never reach real cloud services.
- Any other host (artifact preview, a file, another domain) runs with no server at all, on demo data only.
- Never point a test, script or local run at the production project, and never write test data into production. Automated tests use a mocked or emulated Firebase only.
- Production test leftovers to clean before launch: the test phone number `+972 50-000-0001` in Authentication, and test posts or ratings made by the owner.

## Other standing rules
- The owner is not a programmer: reply in Hebrew only, in plain words.
- Security rules live in `firestore.rules` and must be published in the Firebase console whenever they change. Test changes locally first.
- Private messages are end-to-end encrypted (see the e2e section in `index.html`); never add any path that sends their plaintext to the server.
