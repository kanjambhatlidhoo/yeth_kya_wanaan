# Yeth Kya Wanaan

Yeth Kya Wanaan translates selected English text into Kashmiri using the Sarvam AI translation API. The backend runs on your computer and the Chrome extension sends selected text to it.

![System design](../idea/images/system%20design.png)

## What This Project Does

- Runs a local translation API at `http://localhost:3000/api/translate/`.
- Accepts English text in a JSON request.
- Sends the text to Sarvam AI for Kashmiri translation.
- Returns two values:
  - `translatedString`: Kashmiri translation.
  - `transliteratedRomanString`: Roman transliteration of the Kashmiri text.
- Lets the Chrome extension translate selected text from any webpage through the right-click menu.

## Requirements

Install these before starting:

- Node.js 22 or newer.
- npm, which comes with Node.js.
- Google Chrome.
- A Sarvam AI API key.

To check whether Node.js and npm are installed, run:

```bash
node --version
npm --version
```

## Get a Sarvam API Key

Official Sarvam setup reference:

```text
https://docs.sarvam.ai/api-reference-docs/getting-started
```

1. Go to the Sarvam AI website.
2. Sign in or create an account.
3. Open the API keys or developer dashboard section.
4. Create a new API key.
5. Copy the key. Keep it private.

The backend reads this key from an environment variable named `SARVAM_API_KEY`.

## Install the Backend

From the project root, move into the backend folder:

```bash
cd backend
```

Install the backend packages:

```bash
npm install
```

Create a file named `.env` inside the `backend` folder:

```bash
touch .env
```

Open `backend/.env` and add your Sarvam API key:

```bash
SARVAM_API_KEY=your_sarvam_api_key_here
```

Do not share this file. It is already ignored by Git.

## Run the Backend

For local development, run:

```bash
npm run start
```

The server should start at:

```text
http://localhost:3000/api/translate/
```

The health check endpoint is:

```text
http://localhost:3000/api/translate/health
```

To test the API from the terminal:

```bash
curl -X POST http://localhost:3000/api/translate/ \
  -H "Content-Type: application/json" \
  -d '{"text":"How are you?"}'
```

For a production-style run:

```bash
npm start
```

## Install the Chrome Extension

The extension is in the project folder at:

```text
extension/
```

To load it in Chrome:

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select the project's `extension` folder.
6. Make sure the backend is running with `npm run dev`.
7. Open any webpage, select some English text, right-click, and choose `Translate to Kashmiri`.

The extension currently calls:

```text
http://localhost:3000/api/translate/
```

If you change the backend port or API path, update `API_ENDPOINT` in `extension/background.js`.

## Project Structure

```text
backend/
  config/app.yaml              Server host, port, and API base path
  src/index.ts                 Express server and API routes
  src/services/translate.ts    Sarvam translation call and transliteration
  test/                        Backend tests

extension/
  manifest.json                Chrome extension configuration
  background.js                Right-click menu and backend API call
  content-script.js            Translation dialog shown on webpages
```

## Useful Commands

Run the backend in development mode:

```bash
npm run dev
```

Build TypeScript:

```bash
npm run build
```

Run backend tests:

```bash
npm test
```

Run the built app:

```bash
npm start
```

## Troubleshooting

If the extension shows `Could not translate`, check these:

- The backend is running.
- `backend/.env` exists and contains `SARVAM_API_KEY`.
- The Sarvam API key is valid.
- Chrome has reloaded the unpacked extension after any extension code changes.
- `extension/background.js` points to the same backend URL that the server prints.
- No other app is already using port `3000`.

If dependencies fail to install, check your Node.js version:

```bash
node --version
```

If port `3000` is already busy, either stop the other app or change `server.port` in `backend/config/app.yaml` and update `API_ENDPOINT` in `extension/background.js`.

## Tasks that I'd like completed:

Feel free to contribute and raise PRs for:

- Test coverage for content, background worker scripts.
- A better transliteration into the Romanised alphabet and a devanagari transliteration.
- A cleaning and modular workup for the extension code.

## For any input on added features, please contact me on: 
- Email: kanjamlidhoo@outlook.com/kanjamlidhoo@gmail.com
