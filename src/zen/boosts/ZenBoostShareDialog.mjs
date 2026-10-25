/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// const { gZenBoostsManager } = ChromeUtils.importESModule(
//   "resource:///modules/zen/boosts/ZenBoostsManager.sys.mjs"
// );

export class nsZenBoostShareDialog {
  doc = null;
  shareWindow = null;
  openerWindow = null;

  static OBSERVERS = ["zen-boosts-kill-share"];

  /**
   * Creates a new boost share instance for the specified domain.
   *
   * @param {Document} doc - The document object for the share window.
   * @param {Window} shareWindow - The window object for the share instance.
   * @param {Window} openerWindow - The window object which instanced this editor.
   * @param {object} boost - The boost that will be shared.
   */
  constructor(doc, shareWindow, openerWindow, boost) {
    this.doc = doc;
    this.shareWindow = shareWindow;
    this.openerWindow = openerWindow;
    this.boost = boost;

    this.killOtherShareInstances();

    nsZenBoostShareDialog.OBSERVERS.forEach((observe) => {
      Services.obs.addObserver(this, observe);
    });

    this.currentSignaturePath = null;
    this.points = [];
    this.isPaneFlipped = false;
    this.hasSignature = false;
    this.isRemovingSignature = false;

    this.init();
  }

  /**
   * Initializes the boost share instance by setting up event listeners for all UI controls.
   */
  init() {
    this.shareWindow.addEventListener("unload", () => this.handleClose(), {
      once: true,
    });

    this.doc
      .getElementById("share-button-pane-left-button")
      .addEventListener("click", this.onLeftPaneButtonClick.bind(this));
    this.doc
      .getElementById("share-button-pane-right-button")
      .addEventListener("click", this.onRightPaneButtonClick.bind(this));

    this.doc
      .getElementById("boost-share-close")
      .addEventListener("click", this.onClosePressed.bind(this));
    this.doc
      .getElementById("boost-share-share")
      .addEventListener("click", this.onSharePressed.bind(this));

    this.doc
    .getElementById("boost-name").value = this.boost.boostEntry.boostData.boostName;
    
    this.doc.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" ||
        (event.key === "w" && (event.ctrlKey || event.metaKey))
      ) {
        this.onClosePressed();
      }
    });

    this.initSignature();
    this.updatePaneButtonStyle();
    this.initCapturedSite();
    this.initialized = true;
  }

  /**
   * Uninitializes the boost editor by cleaning up event listeners and observers.
   */
  uninit() {
    this.uninitColorPicker();

    nsZenBoostShareDialog.OBSERVERS.forEach((observe) => {
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
        this.shareWindow.close();
        break;
    }
  }

  /**
   * Callback for when the user presses the close button
   */
  onClosePressed() {
    this.shareWindow.close();
  }

  /**
   * Callback for when share is pressed
   */
  onSharePressed() {
    const animationElement = this.doc.getElementById("shared-animation");
    animationElement.style.display = "flex";

    const nameInput = this.doc.getElementById("boost-name");
    const authorInput = this.doc.getElementById("boost-author");

    nameInput.blur();
    authorInput.blur();

    this.shareWindow.setTimeout(() => {
      animationElement.setAttribute("done", true);
    }, 2000);
  }

  /**
   * Initializes the signature drawboard
   */
  initSignature() {
    const signatureSvg = this.doc.getElementById("signature-svg");

    this.doc.addEventListener("mouseup", this.signatureMouseUp.bind(this));
    signatureSvg.addEventListener(
      "mousedown",
      this.signatureMouseDown.bind(this),
    );
    signatureSvg.addEventListener(
      "mousemove",
      this.signatureMouseMove.bind(this),
    );

    this.shareWindow.requestAnimationFrame(() => {
      const rect = signatureSvg.getBoundingClientRect();
      signatureSvg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    });
  }

  /**
   * Callback for when the user presses down on the signature drawboard
   *
   * @param {MouseEvent} event - The mouse event
   */
  signatureMouseDown(event) {
    if (this.isRemovingSignature) return;

    const signatureSvg = this.doc.getElementById("signature-svg");
    const coords = this.mouseToSignatureCoords(event);

    this.points = [coords];

    this.currentSignaturePath = this.doc.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    this.currentSignaturePath.setAttribute("d", `M${coords.x} ${coords.y}`);
    this.currentSignaturePath.setAttribute("opacity", 1);
    this.currentSignaturePath.setAttribute("fill", "none");
    this.currentSignaturePath.setAttribute("stroke-linecap", "round");
    this.currentSignaturePath.setAttribute("stroke-linejoin", "round");

    this.hasSignature = true;

    signatureSvg.appendChild(this.currentSignaturePath);
    this.updatePaneButtonStyle();
  }

  /**
   * Callback for when the mouse on the drawboard is released
   */
  signatureMouseUp() {
    this.currentSignaturePath = null;
    this.points = [];
  }

  /**
   * Callback for when the user moves the mouse on the drawboard
   *
   * @param {MouseEvent} event - The mouse event
   */
  signatureMouseMove(event) {
    if (!this.currentSignaturePath || this.isRemovingSignature) {
      return;
    }
    const coords = this.mouseToSignatureCoords(event);
    const last = this.points[this.points.length - 1];

    if (!last || this.distance(coords, last) > 2) {
      this.points.push(coords);
      this.currentSignaturePath.setAttribute(
        "d",
        this.buildSmoothPath(this.points),
      );
    }
  }

  /**
   * Resets the signature drawing area
   */
  resetSignature() {
    if (this.isRemovingSignature) return;

    const signatureSvg = this.doc.getElementById("signature-svg");

    signatureSvg.style.setProperty(
      "--stroke-length",
      this.getSignatureLength(),
    );
    signatureSvg.style.setProperty(
      "--stroke-offset",
      -this.getSignatureLength(),
    );
    signatureSvg.classList.add("stroke-out");

    this.isRemovingSignature = true;
    this.shareWindow.setTimeout(() => {
      signatureSvg.setHTML("");

      this.points = [];
      this.currentSignaturePath = null;
      this.hasSignature = false;
      this.isRemovingSignature = false;

      signatureSvg.classList.remove("stroke-out");
      this.updatePaneButtonStyle();
    }, 1000);
  }

  /**
   * Will return the longest path length of the signature
   *
   * @returns {number} The length of the longest path
   */
  getSignatureLength() {
    const paths = this.doc.querySelectorAll("#signature-svg path");
    let longestPath = 0;

    paths.forEach((path) => {
      const pathLength = path.getTotalLength();
      if (longestPath < pathLength) {
        longestPath = pathLength;
      }
    });

    return Math.round(longestPath);
  }

  /**
   * Helper function for building the svg path from the accumulated points
   *
   * @param {object[]} pts - The point array
   * @returns {string} The svg path string
   */
  buildSmoothPath(pts) {
    if (pts.length < 2) {
      return `M${pts[0].x} ${pts[0].y}`;
    }

    let d = `M${pts[0].x} ${pts[0].y}`;

    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      d += ` Q${pts[i].x} ${pts[i].y} ${midX} ${midY}`;
    }

    const last = pts[pts.length - 1];
    d += ` L${last.x} ${last.y}`;

    return d;
  }

  /**
   * Helper function for getting the distance between two points
   *
   * @param {object} pos1 - First point
   * @param {object} pos2 - Second point
   * @returns {number} The distance
   */
  distance(pos1, pos2) {
    return Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2),
    );
  }

  /**
   * Helper function to translate screen coordinates to svg coordinates
   *
   * @param {MouseEvent} mouseEvent - The mouse event
   * @returns {object} The new transformed coordinates
   */
  mouseToSignatureCoords(mouseEvent) {
    const svg = this.doc.getElementById("signature-svg");
    const rect = svg.getBoundingClientRect();

    const viewBox = svg.getAttribute("viewBox").split(" ");

    const scaleX = parseFloat(viewBox[2]) / rect.width;
    const scaleY = parseFloat(viewBox[3]) / rect.height;

    return {
      x: (mouseEvent.clientX - rect.left) * scaleX,
      y: (mouseEvent.clientY - rect.top) * scaleY,
    };
  }

  onLeftPaneButtonClick() {
    const pane = this.doc.getElementById("share-content-pane");

    this.isPaneFlipped = !this.isPaneFlipped;
    pane.setAttribute("flipped", this.isPaneFlipped);

    this.updatePaneButtonStyle();
  }

  onRightPaneButtonClick() {
    if (this.isPaneFlipped && this.hasSignature) {
      this.resetSignature();
    }

    this.updatePaneButtonStyle();
  }

  /**
   * Will update the attributes of the share button pane buttons
   * to display the correct icons
   */
  updatePaneButtonStyle() {
    const leftButton = this.doc.getElementById("share-button-pane-left-button");
    const rightButton = this.doc.getElementById(
      "share-button-pane-right-button",
    );

    rightButton.removeAttribute("disabled");

    if (this.isPaneFlipped) {
      if (this.hasSignature) {
        leftButton.setAttribute("icon", "check");
        rightButton.setAttribute("icon", "remove");
      } else {
        leftButton.setAttribute("icon", "back");
        rightButton.setAttribute("icon", "remove");
        rightButton.setAttribute("disabled", "true");
      }
    } else {
      leftButton.setAttribute("icon", "signature");
      rightButton.setAttribute("icon", "menu");
    }
  }

  /**
   * Handles the window close event
   */
  handleClose() {}
}
