# cashu-redeem

This is a stand-alone open-source demo of the [Nostrly Cashu Redeem Tool](https://www.nostrly.com/cashu-redeem/).

The main script was originally written for use in a WordPress plugin, which is why it uses Javascript / jQuery.

This standalone demo can be run by opening the index.html file in a browser.

## Dev

To install the required packages, run:

```
npm i
```

## Build

Changes to src/main.js can be packaged and saved to public/nostrly-cashu.min.js by running:

```
npm run build
```

## Autopay

Cashu redeem supports invoice / token prefill, and one-click "autopay".

This lets you present users with an option to pay their lightning invoice with Cashu ecash.

The following query params can be used (where `xxx` is the value to prefill):

- Token prefill: `token=xxx`
- Pay to prefill: `to=xxx`, `ln=xxx`, or `lightning=xxx`
- Autopay: `autopay=1`

For example, the following link will autopay lightning invoice `lnbc1abc123` as soon as a Cashu token is entered:

```
https://www.nostrly.com/cashu-redeem/?autopay=1&to=lnbc1abc123
```

If the user has a "change" token stored, an autopay link will start payment as soon as it is clicked.

Examples of lighting checkouts with this in action:

- [Nostrly NIP-05 Address](https://www.nostrly.com/register/)
- [Crown & Anchor Game](https://www.nostrly.com/crown-anchor-game/)

## Disclaimer

Cashu is still new so don't use it for money you would worry about losing. This project was just a weekend hack and could have bugs that lose your money.

## Donate

If you find this demo useful, please consider [buying me a drink](https://donate.cogmentis.com).
