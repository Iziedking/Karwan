# Town list

`towns.json` holds town names, regions and positions from [GeoNames](https://www.geonames.org/), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It is built from `cities15000` (towns of 15,000 people or more) and `admin1CodesASCII` by `scripts/places/build-places.mjs`. Positions are rounded to three decimals. The same build writes `frontend/shared/places/tzCountry.json`.

Karwan uses it to suggest towns as a person types and to find the town nearest a position their phone shares. No outside map service is asked.
