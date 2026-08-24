# MineStar-style Discord Bot

## Funkcje
- /weryfikacja
- /ticket
- /clear
- /ban
- /kick
- /mute
- /unmute
- /say
- /serverinfo
- powitania
- logi wejścia/wyjścia
- logi usuniętych wiadomości

## 1. Konfiguracja

Otwórz `src/config.js` i wpisz ID swojego serwera, kanału powitań, kanału logów oraz roli zweryfikowanej.

## 2. Token

NIE wpisuj tokena do plików wysyłanych na GitHub.

Na hostingu ustaw zmienną środowiskową:

`DISCORD_TOKEN=TWÓJ_TOKEN`

## 3. Uruchomienie lokalne

```bash
npm install
npm start
```

## 4. Uprawnienia bota

Bot powinien mieć m.in.:
- View Channels
- Send Messages
- Manage Messages
- Kick Members
- Ban Members
- Manage Roles
- Manage Channels
- Read Message History

Do działania komend potrzebuje również slash commands.

## 5. Darmowy hosting

Możesz podłączyć repozytorium GitHub do hostingu obsługującego aplikacje Node.js. Ustaw:
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variable: `DISCORD_TOKEN`

Uwaga: darmowe plany hostingowe mogą usypiać aplikacje albo mieć limity. Nie gwarantują pełnego 24/7.
