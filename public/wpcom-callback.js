/* global location, history, document, BroadcastChannel, window */
/*
 * WordPress.com sends the writer back here with the token in the address fragment (Phase 17 Publish).
 * The fragment never goes to a server. This page gives it to the Vlo tab on a BroadcastChannel, takes it
 * out of the address and history, and closes the window.
 */
(function () {
  var fragment = location.hash;
  history.replaceState(null, '', location.pathname);
  var message = document.getElementById('message');
  if (!fragment || typeof BroadcastChannel === 'undefined') {
    if (message) message.textContent = 'Vlo got no answer. Close this window and try again.';
    return;
  }
  var channel = new BroadcastChannel('vlo-wpcom');
  channel.postMessage(fragment);
  channel.close();
  if (message) message.textContent = 'Done. You can close this window and go back to Vlo.';
  window.close();
})();
