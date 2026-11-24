# Meldline

An original online tile-rummy game for 2–4 players (runs, groups, wild stars, 30-point opening). Plays in any modern browser, built for phones.

**Play:** https://sjiwoo.github.io/meldline/

- Drag tiles between your rack and the table; drag the table to pan, pinch / scroll / buttons to zoom, **Fit** to frame every set, **⤢** to expand the table full-screen.
- Solo against bots, or host a table and share the 5-letter code / invite link.
- Multiplayer is peer-to-peer (WebRTC data channels via PeerJS). The host's browser is the authority; every tile move is broadcast as it happens, and tiles held in mid-air show up live on everyone's table.
- A player who drops can rejoin with the same name and table code. If the host leaves, the table ends.

## Files
- `js/logic.js` — rules, validation, bot (pure; `node test/logic.test.js`)
- `js/app.js` — UI, host, networking
- `vendor/peerjs.min.js` — PeerJS (MIT)

Signalling uses the free public PeerJS broker. To use your own PeerServer add `?signal=host:port` to the URL.
