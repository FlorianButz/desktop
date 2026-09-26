/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { nsZenDOMOperatedFeature } from "chrome://browser/content/zen-components/ZenCommonUtils.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(
  lazy,
  { ZenLibrary: "moz-src:///zen/library/ZenLibrary.mjs" },
  { global: "current" }
);

class nsZenSpaceAddSwipe extends nsZenDOMOperatedFeature {
  #progressVal = 0;
  #element = null;
  #progressBadge = null;
  #backgroundGradient = null;
  #swipeOngoing = false;

  #springControls = null;
  #isAnimatingBack = false;

  static CREATION_THRESHOLD = 1;
  static SPACES_TRANSLATION = -25;

  async init() {}

  #easeInOut(x) {
    x = Math.min(Math.max(x, 0), 1);
    return -(Math.cos(Math.PI * x) - 1) / 2;
  }

  set #progress(value) {
    if (!this.#element) {
      return;
    }

    const isNowReady = this.#progressVal < 1 && value >= 1;
    const isNowUnready = this.#progressVal >= 1 && value < 1;
    this.#progressVal = value;

    const moveProgress = 1 - Math.min(value * 2, 1);

    const rightSide = this.#tabsOnRight;
    const rightSideFactor = rightSide ? -1 : 1;
    this.#element.style.translate = `calc(100% * ${moveProgress * rightSideFactor}) 0`;

    this.#backgroundGradient.style.setProperty("scale", `${value} 3`);
    this.#backgroundGradient.style.setProperty("opacity", `${value}`);

    this.#progressBadge.style.setProperty(
      "--value",
      this.#easeInOut(value) * 100
    );

    if (isNowReady || isNowUnready) {
      this.#element.toggleAttribute("readytoadd");
      // eslint-disable-next-line mozilla/valid-services
      Services.zen.playHapticFeedback();
    }

    const currentWorkspace = gZenWorkspaces.getActiveWorkspaceFromCache();
    gZenWorkspaces._organizeWorkspaceStripLocations(
      currentWorkspace,
      true,
      value * nsZenSpaceAddSwipe.SPACES_TRANSLATION * rightSideFactor
    );
  }

  get #tabsOnRight() {
    return gZenVerticalTabsManager._prefsRightSide;
  }

  get #progress() {
    return this.#progressVal;
  }

  get #libraryOnRight() {
    return lazy.ZenLibrary.libraryOnRight;
  }

  #readySwipeAdd = null;

  /**
   * Checks if the space add element should show
   * if a swipe would happen right now.
   *
   * @returns {boolean} True if it should show
   */
  readySwipeAddSpace() {
    if (this.#readySwipeAdd !== null) {
      return this.#readySwipeAdd;
    }

    const spaces = gZenWorkspaces.getWorkspaces();
    const current = gZenWorkspaces.getActiveWorkspaceFromCache();
    const libraryEnabled = Services.prefs.getBoolPref("zen.library.enabled");
    const wrapAroundEnabled = Services.prefs.getBoolPref(
      "zen.workspaces.wrap-around-navigation"
    );
    const libraryOnRight = lazy.ZenLibrary.libraryOnRight;

    this.#readySwipeAdd =
      spaces.indexOf(current) === (libraryOnRight ? 0 : spaces.length - 1) &&
      libraryEnabled &&
      !wrapAroundEnabled;
    return this.#readySwipeAdd;
  }

  clearReadySwipeLibraryCache() {
    this.#readySwipeAdd = null;
  }

  /**
   * Reset the swipe to avoid the following swipe
   * to be stuck during the cancel animation
   */
  swipeReset() {
    this.#cancelAnimateClose();

    if (this.#progress != 0) {
      this.#progress = 0;
      this.#afterSwipeAction();
    }
  }

  /**
   * Callback for when a swipe action is started.
   */
  startSwipe() {
    this.#cancelAnimateClose();

    this.#addElement();
    this.#progress = 0;

    this.#swipeOngoing = true;
    this.#hideNextSpaceChild();
  }

  /**
   * Callback for when a swipe is
   * successfully stopped. Another additional check will
   * ensure that a specific threshold was reached before
   * opening the space creation form.
   */
  endSwipe() {
    if (this.#progress >= nsZenSpaceAddSwipe.CREATION_THRESHOLD) {
      this.#progress = 0;
      gZenWorkspaces.openWorkspaceCreation(null);
    } else {
      this.#animateClose();
    }
  }

  /**
   * Helper function to create an overshoot /
   * rubber band effect for the swipe interaction.
   *
   * @param {number} offset - The amount that overshot
   * @param {number} dimension - Reference scale
   * @param {number} constant - Rubber constant
   * @returns {number} The damped value
   */
  #rubberBand(offset, dimension, constant = 0.55) {
    if (offset === 0 || dimension === 0) {
      return 0;
    }
    return (
      dimension *
      (1 - Math.exp(-(Math.abs(offset) * constant) / dimension)) *
      Math.sign(offset)
    );
  }

  /**
   * Calculates the correct progress based on the
   * normalized swipe translation and updates the
   * swipe progress with additional rubber banding.
   *
   * @param {number} rawProgress - The normalized swipe translation
   */
  swipeProgress(rawProgress) {
    const DAMPING_DIMENSION = 0.2;
    const RUBBER_BAND_CONSTANT = 0.08;
    const ADD_SWIPE_FULL = 1.55;

    const translation = !this.#libraryOnRight ? -rawProgress : rawProgress;
    const deltaProgress = translation * ADD_SWIPE_FULL;

    let progressDamped;
    if (deltaProgress < 0) {
      progressDamped =
        0 +
        this.#rubberBand(
          deltaProgress,
          DAMPING_DIMENSION,
          RUBBER_BAND_CONSTANT
        );
    } else if (deltaProgress > 1) {
      progressDamped =
        1 +
        this.#rubberBand(
          deltaProgress - 1,
          DAMPING_DIMENSION,
          RUBBER_BAND_CONSTANT
        );
    } else {
      progressDamped = deltaProgress;
    }

    this.#progress = progressDamped;
  }

  /**
   * Callback for whenever the cancel
   * swipe animation is completed.
   */
  onSwipeAnimationEnd() {
    this.#progress = 0;
    this.#afterSwipeAction();
  }

  /**
   * Cancels ongoing close animations to
   * avoid conflicts during new swipe actions.
   */
  #cancelAnimateClose() {
    this.#isAnimatingBack = false;
    if (this.#springControls) {
      this.#springControls.stop();
      this.#springControls = null;
    }
  }

  /**
   * Animates the cancel animation and
   * destroys the element afterwards.
   */
  #animateClose() {
    this.#cancelAnimateClose();

    this.#isAnimatingBack = true;
    this.#springControls = gZenUIManager.motion.animate(this.#progress, 0, {
      type: "spring",
      stiffness: 620,
      damping: 47,
      mass: 2,
      onUpdate: latest => {
        this.#progress = latest;
      },
      onComplete: () => {
        this.#progress = 0;
        this.#springControls = null;
        this.#isAnimatingBack = false;

        this.#afterSwipeAction();
      },
    });
  }

  #afterSwipeAction() {
    if (!this.#swipeOngoing || this.#isAnimatingBack) {
      return;
    }
    this.#swipeOngoing = false;

    this.#destroyElement();
    this.#restoreNextSpaceChild();
  }

  /**
   * Helper method for hiding the next space
   * before the swipe to avoid visual conflicts
   * during the swipe/create space form animation
   */
  #hideNextSpaceChild() {
    // TODO: Properly hide next/previous space
  }

  /**
   * Helper method for restoring the
   * next space's visibility
   */
  #restoreNextSpaceChild() {
    // TODO: Restore next/previous space
  }

  #addElement() {
    if (this.#element) {
      return;
    }

    const container = document.createElement("div");
    container.className = "zen-swipe-add-space-container";

    this.#backgroundGradient = document.createElement("div");
    this.#backgroundGradient.className = "zen-swipe-add-space-background";

    this.#progressBadge = document.createElement("div");
    this.#progressBadge.className = "zen-swipe-add-space-progress-badge";
    container.append(this.#progressBadge);

    const plusIcon = document.createElement("span");
    plusIcon.className = "zen-swipe-add-space-icon";
    this.#progressBadge.append(plusIcon);

    this.#element = container;

    const navbar = document.getElementById("tabbrowser-tabs");
    navbar.append(this.#element);
    navbar.append(this.#backgroundGradient);
  }

  #destroyElement() {
    this.#element.remove();
    this.#element = null;
    this.#progressBadge = null;
    this.#backgroundGradient = null;
  }
}

window.gZenSpaceAddSwipe = new nsZenSpaceAddSwipe();
