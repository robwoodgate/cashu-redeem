// Imports
import {
  CashuMint,
  CashuWallet,
  getDecodedToken,
  CheckStateEnum,
  getEncodedTokenV4,
} from "@cashu/cashu-ts";
import { decode } from "@gandlaf21/bolt11-decode";
import { nip19 } from "nostr-tools";
import bech32 from "bech32";
import $ from "jquery"; // We are not in WordPress now, Dorothy...
import confetti from "canvas-confetti";
import {
  encode as emojiEncode,
  decode as emojiDecode,
} from "./emoji-encoder.ts";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

// Cashu Redeem
$(function ($) {
  let wallet;
  let mintUrl = "";
  let proofs = [];
  let tokenAmount = 0;
  let params = new URL(document.location.href).searchParams;
  let autopay = decodeURIComponent(params.get("autopay") ?? "");

  // DOM elements
  const $lnurl = $("#lnurl");
  const $token = $("#token");
  const $tokenStatus = $("#tokenStatus");
  const $lightningStatus = $("#lightningStatus");
  const $pkey = $("#pkey");
  const $pkeyWrapper = $("#pkeyWrapper");
  const $tokenRemover = $("#tokenRemover");
  const $lnurlRemover = $("#lnurlRemover");
  const $redeemButton = $("#redeem");

  // Helpers to get invoice from Lightning address | LN URL
  const isLnurl = (address) =>
    address.split("@").length === 2 ||
    address.toLowerCase().startsWith("lnurl1");
  const getInvoiceFromLnurl = async (address = "", amount = 0) => {
    try {
      if (!address) throw "Error: address is required!";
      if (!amount) throw "Error: amount is required!";
      if (!isLnurl(address)) throw "Error: invalid address";
      let data = {
        tag: "",
        minSendable: 0,
        maxSendable: 0,
        callback: "",
        pr: "",
      };
      if (address.split("@").length === 2) {
        const [user, host] = address.split("@");
        const response = await fetch(
          `https://${host}/.well-known/lnurlp/${user}`,
        );
        if (!response.ok) throw "Unable to reach host";
        const json = await response.json();
        data = json;
      } else {
        const dataPart = bech32.decode(address, 20000).words;
        const requestByteArray = bech32.fromWords(dataPart);
        const host = new TextDecoder().decode(new Uint8Array(requestByteArray));
        const response = await fetch(host);
        if (!response.ok) throw "Unable to reach host";
        const json = await response.json();
        data = json;
      }
      if (
        data.tag == "payRequest" &&
        data.minSendable <= amount * 1000 &&
        amount * 1000 <= data.maxSendable
      ) {
        const response = await fetch(
          `${data.callback}?amount=${amount * 1000}`,
        );
        if (!response.ok) throw "Unable to reach host";
        const json = await response.json();
        return json.pr ?? new Error("Unable to get invoice");
      } else throw "Host unable to make a lightning invoice for this amount.";
    } catch (err) {
      console.error(err);
      return "";
    }
  };

  // Helper to process the Cashu Token
  const processToken = async (event) => {
    if (event) event.preventDefault();
    $tokenRemover.removeClass("hidden");
    $tokenStatus.text("Checking token, one moment please...");
    $lightningStatus.text("");
    try {
      const tokenEncoded = $token.val();
      if (!tokenEncoded) {
        $tokenStatus.text("");
        $tokenRemover.addClass("hidden");
        $pkeyWrapper.hide();
        $redeemButton.prop("disabled", true);
        tokenAmount = 0;
        return;
      }
      let token; // scope
      try {
        token = getDecodedToken(tokenEncoded);
      } catch (err) {
        // Try decoding as an emoji, update token input before
        // token decode attempt as it throws an error on fail
        const emoji = emojiDecode(tokenEncoded);
        if (emoji) {
          // ignore if no peanut data
          $token.val(emoji);
        }
        token = getDecodedToken(emoji); // throws on fail
      }
      console.log("token :>> ", token);
      if (!token.proofs.length || !token.mint.length) {
        throw "Token format invalid";
      }
      mintUrl = token.mint;
      const mint = new CashuMint(mintUrl);
      wallet = new CashuWallet(mint);
      await wallet.loadMint();
      proofs = token.proofs ?? [];
      console.log("proofs :>>", proofs);
      const proofStates = await wallet.checkProofsStates(proofs);
      console.log("proofStates :>>", proofStates);
      // Check state of token's proofs``
      let unspentProofs = [];
      proofStates.forEach((state, index) => {
        if (state.state == CheckStateEnum.UNSPENT) {
          // console.log("UNSPENT :>>", proofs[index]);
          unspentProofs.push(proofs[index]);
        }
      });
      console.log("unspentProofs :>>", unspentProofs);
      // All proofs spent?
      if (!unspentProofs.length) {
        // Is this our saved token? If so, remove it
        const lstoken = localStorage.getItem("nostrly-cashu-token");
        if (lstoken == $token.val()) {
          localStorage.removeItem("nostrly-cashu-token");
        }
        throw "Token already spent";
      }
      // Token partially spent - so update token
      if (unspentProofs.length != proofs.length) {
        $token.val(getEncodedTokenV4({ mint: mintUrl, proofs: unspentProofs }));
        proofs = unspentProofs;
        $lightningStatus.text(
          "(Partially spent token detected - new token generated)",
        );
      }
      tokenAmount = proofs.reduce(
        (accumulator, currentValue) => accumulator + currentValue.amount,
        0,
      );
      // Check if proofs are P2PK locked
      const lockedProofs = proofs.filter(function (k) {
        return k.secret.includes("P2PK");
      });
      if (lockedProofs.length) {
        // they are
        console.log("P2PK locked proofs found:>>", lockedProofs);
        // Show the npub this token is locked to
        const p2pkSecret = JSON.parse(lockedProofs[0].secret); // first one
        const npub = nip19.npubEncode(p2pkSecret[1].data.slice(2));
        $lightningStatus.html(
          `Token is P2PK locked to <a href="https://njump.me/${npub}" target="_blank">${npub.substring(0, 12)}...`,
        );
        // If no signString() compatible extension detected, we'll have
        // to ask for an nsec/private key :(
        // Hey fiatjaf... free the nsec, it's 2025 !!!!
        if (
          typeof window?.nostr?.signSchnorr === "undefined" &&
          typeof window?.nostr?.signString === "undefined"
        ) {
          $pkeyWrapper.show();
          if (!$pkey.val()) {
            $tokenStatus.html(
              "Enter your private key or enable a <em>signString()</em> compatible Nostr Extension</a>.",
            );
            return;
          }
        }
      } else {
        $pkeyWrapper.hide();
        $pkey.val("");
      }
      let mintHost = new URL(mintUrl).hostname;
      $tokenStatus.text(
        `Token value ${tokenAmount} sats from the mint: ${mintHost}`,
      );
      // $lightningStatus.text('Redeem to address / pay invoice...');
      // Enable redeem button if lnurl is already set
      if ($lnurl.val()) {
        $redeemButton.prop("disabled", false);
      }
      // Autopay?
      if (autopay && $lnurl.val().length) {
        // Clear URL params if this is a repeat (eg: page refresh)
        let lastpay = localStorage.getItem("nostrly-cashu-last-autopay");
        if (lastpay == $lnurl.val()) {
          window.location.href =
            window.location.origin + window.location.pathname;
          return; // belt+braces
        }
        await makePayment();
      }
    } catch (err) {
      console.error(err);
      let errMsg = `${err}`;
      if (
        errMsg.startsWith("InvalidCharacterError") ||
        errMsg.startsWith("SyntaxError:")
      ) {
        errMsg = "Invalid Token!";
      }
      $tokenStatus.text(errMsg);
    }
  };

  // Melt the token and send the payment
  const makePayment = async (event) => {
    if (event) event.preventDefault();
    $lightningStatus.text("Attempting payment...");
    try {
      if (tokenAmount < 4) {
        throw "Minimum token amount is 4 sats";
      }
      // The Alby extension can sign schnorr signatures directly - woohoo!
      if (typeof window?.nostr?.signSchnorr !== "undefined") {
        console.log("we can signSchnorr!");
        await signSchnorrProofs(proofs); // sign main proofs array
      }
      // Support for proposed NIP-07 schnorr signer
      // @see: https://github.com/nostr-protocol/nips/pull/1842
      else if (typeof window?.nostr?.signString !== "undefined") {
        console.log("we can signString!");
        await signStringProofs(proofs); // sign main proofs array
      }
      console.log("signed proofs :>>", proofs);
      let invoice = "";
      let address = $lnurl.val() ?? "";
      let iterateFee = null;
      let meltQuote = null;
      if (isLnurl(address)) {
        let iterateAmount =
          tokenAmount - Math.ceil(Math.max(3, tokenAmount * 0.02));
        let iterateFee = 0;
        while (iterateAmount + iterateFee != tokenAmount) {
          iterateAmount = tokenAmount - iterateFee;
          invoice = await getInvoiceFromLnurl(address, iterateAmount);
          meltQuote = await wallet.createMeltQuote(invoice);
          iterateFee = meltQuote.fee_reserve;
          console.log("invoice :>> ", invoice);
          console.log("iterateAmount :>> ", iterateAmount);
          console.log("iterateFee :>> ", iterateFee);
        }
      } else {
        invoice = address;
        meltQuote = await wallet.createMeltQuote(invoice);
      }
      // wallet and tokenAmount let us know processToken succeeded
      // If so, check invoice can be covered by the tokenAmount
      if (!wallet || !invoice || !tokenAmount) throw "OOPS!";
      const decodedInvoice = await decode(invoice);
      const amountToSend = meltQuote.amount + meltQuote.fee_reserve;
      if (amountToSend > tokenAmount) {
        throw (
          "Not enough to pay the invoice: needs " +
          meltQuote.amount +
          " + " +
          meltQuote.fee_reserve +
          " sats"
        );
      }
      $lightningStatus.text(
        `Sending ${meltQuote.amount} sats (plus ${meltQuote.fee_reserve} sats network fees) via Lightning`,
      );

      // Convert nsec to hex if needed
      let privkey = $pkey.val();
      if (privkey && privkey.startsWith("nsec1")) {
        const { type, data } = nip19.decode(privkey);
        // NB: nostr-tools doesn't hex string nsec automatically
        if (type === "nsec" && data.length === 32) {
          privkey = bytesToHex(data);
        }
      }
      console.log("privkey:>>", privkey);

      // CashuWallet.send performs coin selection and swaps the proofs with the mint
      // if no appropriate amount can be selected offline. We must include potential
      // ecash fees that the mint might require to melt the resulting proofsToSend later.
      const { keep: proofsToKeep, send: proofsToSend } = await wallet.send(
        amountToSend,
        proofs,
        {
          includeFees: true,
          privkey: privkey,
        },
      );
      console.log("proofsToKeep :>> ", proofsToKeep);
      console.log("proofsToSend :>> ", proofsToSend);
      const meltResponse = await wallet.meltProofs(meltQuote, proofsToSend);
      console.log("meltResponse :>> ", meltResponse);
      if (meltResponse.quote) {
        $lightningStatus.text("Payment successful!");
        doConfettiBomb();
        // Tokenize any unspent proofs
        if (proofsToKeep.length > 0 || meltResponse.change.length > 0) {
          $lightningStatus.text("Success! Preparing your change token...");
          const change = proofsToKeep.concat(meltResponse.change);
          let newToken = getEncodedTokenV4({ mint: mintUrl, proofs: change });
          console.log("change token :>> ", newToken);
          localStorage.setItem("nostrly-cashu-token", newToken);
          setTimeout(() => {
            $redeemButton.prop("disabled", true);
            $lnurlRemover.addClass("hidden");
            $lnurl.val("");
            $token.val(newToken);
            $token.trigger("input");
          }, 5000);
        }
        // Update last autopay destination
        if (autopay) {
          localStorage.setItem("nostrly-cashu-last-autopay", invoice);
        }
      } else {
        $lightningStatus.text("Payment failed");
      }
    } catch (err) {
      console.error(err);
      $lightningStatus.text("Payment failed: " + err);
    }
  };

  // Event Listeners
  $tokenRemover.on("click", (e) => {
    e.preventDefault();
    $token.val("");
    $tokenStatus.text("");
    $lightningStatus.text("");
    $tokenRemover.addClass("hidden");
    $redeemButton.prop("disabled", true);
    tokenAmount = 0;
    $pkeyWrapper.hide();
    $pkey.val("");
  });
  $lnurlRemover.on("click", (e) => {
    e.preventDefault();
    $lnurl.val("");
    $lnurlRemover.addClass("hidden");
    $redeemButton.prop("disabled", true);
  });
  $token.on("input", processToken);
  $lnurl.on("input", () => {
    if ($lnurl.val()) {
      $lnurlRemover.removeClass("hidden");
      $redeemButton.prop("disabled", false);
    } else {
      $lnurlRemover.addClass("hidden");
      $redeemButton.prop("disabled", true);
    }
  });
  // Debounce pkey input to prevent excessive mint calls
  let timeout = null;
  $pkey.on("input", () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      processToken();
    }, 1000);
  });
  $redeemButton.on("click", async (event) => {
    makePayment(event);
    $redeemButton.prop("disabled", true);
  });

  // Allow auto populate fields
  const token = decodeURIComponent(params.get("token") ?? "");
  const lstoken = localStorage.getItem("nostrly-cashu-token");
  const to = decodeURIComponent(
    params.get("ln") || params.get("lightning") || params.get("to") || "",
  );
  if (token) {
    // Try URL token first...
    $(".preamble").hide();
    $token.val(token);
    processToken();
  } else if (lstoken) {
    // ... Saved change second
    $(".preamble").hide();
    $token.val(lstoken);
    processToken();
  }
  if (to) {
    $(".preamble").hide();
    $lnurl.val(to);
    $lnurl.trigger("input");
  }

  // Confetti bomb
  function doConfettiBomb() {
    // Do the confetti bomb
    var duration = 0.25 * 1000; //secs
    var end = Date.now() + duration;

    (function frame() {
      // launch a few confetti from the left edge
      confetti({
        particleCount: 7,
        angle: 60,
        spread: 55,
        origin: {
          x: 0,
        },
      });
      // and launch a few from the right edge
      confetti({
        particleCount: 7,
        angle: 120,
        spread: 55,
        origin: {
          x: 1,
        },
      });

      // keep going until we are out of time
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
    confetti.reset();
  }

  // Sign P2PK proofs using Alby Nostr Extension
  async function signSchnorrProofs(proofs) {
    if (typeof window?.nostr?.signSchnorr === "undefined") return;
    for (const [index, proof] of proofs.entries()) {
      if (!proof.secret.includes("P2PK")) continue;
      const hash = bytesToHex(sha256(proof.secret));
      // console.log('hash:>>', hash);
      const schnorr = await window.nostr.signSchnorr(hash);
      if (schnorr.length) {
        console.log("schnorr :>>", schnorr);
        proofs[index].witness = JSON.stringify({ signatures: [schnorr] });
      }
    }
  }

  // Sign P2PK proofs using propsed NIP-07 method
  // @see: https://github.com/nostr-protocol/nips/pull/1842
  async function signStringProofs(proofs) {
    if (typeof window?.nostr?.signString === "undefined") return;
    for (const [index, proof] of proofs.entries()) {
      if (!proof.secret.includes("P2PK")) continue;
      const expHash = bytesToHex(sha256(proof.secret));
      const { hash, sig, pubkey } = await window.nostr.signString(proof.secret);
      // Check we got a signature from expected pubkey on expected hash
      if (sig.length && proof.secret.includes(pubkey) && expHash === hash) {
        console.log("schnorr :>>", sig);
        proofs[index].witness = JSON.stringify({ signatures: [sig] });
      }
    }
  }
});
