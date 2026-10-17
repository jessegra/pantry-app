import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// jsdom has no modal <dialog> support. (Node-environment tests have no DOM at all.)
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}
