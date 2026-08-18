# Europe Activity Map — source & license

The Europe map used on the Community page is the political SVG:

- **File:** `Blank map of Europe cropped.svg`
- **Source:** Wikimedia Commons
  https://commons.wikimedia.org/wiki/File:Blank_map_of_Europe_cropped.svg
- **Local copy:** `assets/images/europe-map.svg`
- **License:** Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)
  https://creativecommons.org/licenses/by-sa/3.0/

We do **not** hotlink Wikimedia in production; the file is vendored here. The SVG
uses ISO-3166-1 **alpha-3** `class="region XXX"` attributes; the frontend maps its
ISO-3166-1 **alpha-2** data codes to alpha-3 via a lookup (`europe-map.js`).
