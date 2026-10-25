/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// const { gZenBoostsManager } = ChromeUtils.importESModule(
//   "resource:///modules/zen/boosts/ZenBoostsManager.sys.mjs"
// );

export class nsZenBoostReceiveDialog {
  doc = null;
  receiveWindow = null;
  openerWindow = null;

  static OBSERVERS = ["zen-boosts-kill-share"];

  /**
   * Creates a new boost share instance for the specified domain.
   *
   * @param {Document} doc - The document object for the share window.
   * @param {Window} receiveWindow - The window object for the share instance.
   * @param {Window} openerWindow - The window object which instanced this editor.
   * @param {object} sharedBoost - The boost that is received. { name, author, boost: { boostData } }
   */
  constructor(doc, receiveWindow, openerWindow, sharedBoost) {
    this.doc = doc;
    this.receiveWindow = receiveWindow;
    this.openerWindow = openerWindow;
    this.sharedBoost = sharedBoost;

    this.killOtherShareInstances();

    nsZenBoostReceiveDialog.OBSERVERS.forEach((observe) => {
      Services.obs.addObserver(this, observe);
    });

    this.currentSignaturePath = null;
    this.points = [];
    this.isPaneFlipped = false;
    this.hasSignature = false;
    this.isRemovingSignature = false;
    this.affectedDomain = sharedBoost.domain;

    this.init();
  }

  /**
   * Initializes the boost share instance by setting up event listeners for all UI controls.
   */
  init() {
    this.receiveWindow.addEventListener("unload", () => this.handleClose(), {
      once: true,
    });

    // Add Zen Theme
    this.doc.documentElement.style.setProperty(
      "--zen-primary-color",
      "rgb(243, 6, 124)"
    );

    this.doc
      .getElementById("boost-share-close")
      .addEventListener("click", this.onClosePressed.bind(this));
    this.doc
      .getElementById("boost-share-get")
      .addEventListener("click", this.onGetPressed.bind(this));
    this.doc
      .getElementById("boost-info-button")
      .addEventListener("click", this.onBoostInfoButtonPressed.bind(this));

    this.doc
      .getElementById("zen-boost-share-receive-info")
      .setHTML(`<p>Boost creator names are not verified. Boosts can modify the appearance of your page using CSS and visual filters. They can't run code or send your data elsewhere. This boost will run only on ${this.affectedDomain}</p>`);

    this.doc
      .getElementById("boost-target-domain")
      .setHTML(this.affectedDomain);
    
      this.doc
      .getElementById("boost-name")
      .setHTML(this.sharedBoost.boostEntry.boostData.boostName);

    this.doc.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" ||
        (event.key === "w" && (event.ctrlKey || event.metaKey))
      ) {
        this.onClosePressed();
      }
    });

    this.initialized = true;
  }

  /**
   * Uninitializes the boost editor by cleaning up event listeners and observers.
   */
  uninit() {
    this.uninitColorPicker();

    nsZenBoostReceiveDialog.OBSERVERS.forEach((observe) => {
      Services.obs.removeObserver(this, observe);
    });
  }

  async initCapturedSite() {
    const canvas = this.doc.getElementById("screenshot-canvas");
    const ctx = canvas.getContext("2d");
    const browser = this.openerWindow.gBrowser.selectedBrowser;
    const scale = this.openerWindow.devicePixelRatio;

    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = cssWidth * scale;
    canvas.height = cssHeight * scale;

    const snapshot =
      await browser.browsingContext.currentWindowGlobal.drawSnapshot(
        null,
        scale,
        "rgb(255,255,255)",
      );

    const srcW = snapshot.width;
    const srcH = snapshot.height;
    const dstW = canvas.width;
    const dstH = canvas.height;

    const ratio = Math.max(dstW / srcW, dstH / srcH);
    const scaledW = srcW * ratio;
    const scaledH = srcH * ratio;
    const offsetX = (dstW - scaledW) / 2;
    const offsetY = (dstH - scaledH) / 2;

    ctx.drawImage(snapshot, offsetX, offsetY, scaledW, scaledH);
    snapshot.close();
  }

  /**
   * Kills all other share dialog instances
   */
  killOtherShareInstances() {
    Services.obs.notifyObservers(null, "zen-boosts-kill-editor");
  }

  /**
   * Observer callback that handles notifications from the observer service.
   * Closes the share window when a 'zen-boosts-kill-share' notification is received.
   *
   * @param {object} subject - The subject of the notification.
   * @param {string} topic - The topic of the notification.
   */
  observe(subject, topic) {
    switch (topic) {
      case "zen-boosts-kill-share":
        this.receiveWindow.close();
        break;
    }
  }

  /**
   * Callback for when the user presses the close button
   */
  onClosePressed() {
    this.receiveWindow.close();
  }

  /**
   * Callback for when the user presses the get button
  */
  onGetPressed() {

  }

  /**
   * Callback for when the boost info button is pressed, opens the popup
   */
  onBoostInfoButtonPressed(event) {
    const panel = this.doc.getElementById("zen-boost-share-receive-info");
    panel.openPopup(event.target, "centerleft centerright", 0, 2);
  }

  /**
   * Handles the window close event
   */
  handleClose() {}
}
