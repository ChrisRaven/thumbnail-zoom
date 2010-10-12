/**
 * Copyright (c) 2010 Andres Hernandez Monge
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of copyright holders nor the names of its
 *    contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED
 * TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL COPYRIGHT HOLDERS OR CONTRIBUTORS
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

Cu.import("resource://imagezoom/common.js");
Cu.import("resource://imagezoom/pages.js");
Cu.import("resource://imagezoom/filterService.js");
Cu.import("resource://imagezoom/uninstallService.js");

/**
 * Controls the browser overlay.
 */
ImageZoomChrome.Overlay = {
  /* UI preference keys. */
  PREF_PANEL_KEY : ImageZoom.PrefBranch + "panel.key",
  PREF_PANEL_DELAY : ImageZoom.PrefBranch + "panel.delay",
  PREF_STATUSBAR_SHOW : ImageZoom.PrefBranch + "statusbar.show",

  /* Logger for this object. */
  _logger : null,
  /* Preferences service. */
  _preferencesService : null,

  /* The timer. */
  _timer : null,
  /* The floating panel. */
  _panel : null,
  /* The floating panel image. */
  _panelImage : null,
  /* The current image source. */
  _currentImage : null,

  /**
   * Initializes the object.
   */
  init : function() {
    this._logger = ImageZoom.getLogger("ImageZoomChrome.Overlay");
    this._logger.debug("init");

    this._preferencesService =
      Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch2);
    this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._panel = document.getElementById("imagezoom-panel");
    this._panelImage = document.getElementById("imagezoom-panel-image");

    this._preferencesService.addObserver(this.PREF_STATUSBAR_SHOW, this, false);
    this._addMenuItems();
    this._addPreferenceObservers(true);
    this._showStatusBarButton();
    this._updatePreferencesUI();
    this._addEventListeners();
  },

  /**
   * Uninitializes the object.
   */
  uninit : function() {
    this._logger.debug("uninit");

    this._panel = null;
    this._panelImage = null;
    this._currentImage = null;
    this._preferencesService.removeObserver(this.PREF_STATUSBAR_SHOW, this);
    this._addPreferenceObservers(false);
  },

  /**
   * Adds the menu items.
   */
  _addMenuItems : function() {
    this._logger.debug("_addMenuItems");

    let menuPopup = document.getElementById("imagezoom-status-menu");
    let menuSeparator =
      document.getElementById("imagezoom-status-menuseparator");
    let menuItem = null;
    let pageCount = ImageZoom.FilterService.pageList.length;
    let pageInfo = null;

    for (let i = 0; i < pageCount; i++) {
      pageInfo = ImageZoom.FilterService.pageList[i];
      menuItem = document.createElement("menuitem");
      menuItem.setAttribute("id", "imagezoom-status-menuitem-" + pageInfo.key);
      menuItem.setAttribute("label", pageInfo.name);
      menuItem.setAttribute("type", "checkbox");
      menuItem.setAttribute(
        "oncommand", "ImageZoomChrome.Overlay.togglePreference(" + i + ");");
      menuPopup.insertBefore(menuItem, menuSeparator);
    }
  },

  /**
   * Adds the preference observers.
   * @param aValue true if adding, false when removing.
   */
  _addPreferenceObservers : function(aValue) {
    this._logger.debug("_addPreferenceObservers");

    let pageCount = ImageZoom.FilterService.pageList.length;
    let preference = null;
    let pageInfo = null;

    for (let i = 0; i < pageCount; i++) {
      pageInfo = ImageZoom.FilterService.pageList[i];
      preference = ImageZoom.PrefBranch + pageInfo.key + ".enable";

      if (aValue) {
        this._preferencesService.addObserver(preference, this, false);
      } else {
        this._preferencesService.removeObserver(preference, this);
      }
    }
  },

  /**
   * Updates the UI that depends on preferences.
   */
  _updatePreferencesUI : function() {
    this._logger.trace("_updatePreferencesUI");

    let pageCount = ImageZoom.FilterService.pageList.length;

    for (let i = 0; i < pageCount; i++) {
      this._updateStatusbarMenu(i);
    }
  },

  /**
   * Adds the event listeners.
   */
  _addEventListeners : function() {
    this._logger.trace("_addEventListeners");

    let that = this;

    gBrowser.addEventListener(
      "DOMContentLoaded",
      function(aEvent) { that._handlePageLoaded(aEvent); }, true);
    gBrowser.tabContainer.addEventListener(
      "TabSelect",
      function(aEvent) { that._handleTabSelected(aEvent); }, false);
  },

  /**
   * Handles the TabSelect event.
   * @param aEvent the event object.
   */
  _handleTabSelected : function(aEvent) {
    this._logger.trace("_handlePageLoaded");

    this._closePanel();
  },

  /**
   * Handles the DOMContentLoaded event.
   * @param aEvent the event object.
   */
  _handlePageLoaded : function(aEvent) {
    this._logger.trace("_handlePageLoaded");

    let that = this;
    let doc = aEvent.originalTarget;

    if (doc instanceof HTMLDocument) {
      let pageConstant = ImageZoom.FilterService.getPageConstantByDoc(doc);

      if (-1 != pageConstant) {
        doc.addEventListener(
          "mouseover",
          function(aEvent) {
            that._handleMouseOver(aEvent, pageConstant);
          }, true);
      } else {
        this._closePanel();
      }
    } else {
      this._closePanel();
    }
  },

  /**
   * Handles the mouse over event.
   * @param aEvent the event object.
   * @param aPage the filtered page.
   */
  _handleMouseOver : function(aEvent, aPage) {
    this._logger.trace("_handleMouseOver");

    let node = aEvent.target;
    let imageSource = ImageZoom.FilterService.getImageSource(node, aPage);

    if (null != imageSource && this._isKeyActive(aEvent)) {
      if (ImageZoom.FilterService.isPageEnabled(aPage) &&
          ImageZoom.FilterService.filterImage(imageSource, aPage)) {
        let that = this;

        this._timer.cancel();
        this._timer.initWithCallback({ notify:
          function() { that._showZoomImage(imageSource, node, aPage); }
        }, this._getHoverTime(), Ci.nsITimer.TYPE_ONE_SHOT);
      } else {
        this._closePanel();
      }
    } else {
      this._closePanel();
    }
  },

  /**
   * Verifies if the key is active.
   * @param aEvent the event object.
   * @return true if active, false otherwise.
   */
  _isKeyActive : function(aEvent) {
    this._logger.trace("_isKeyActive");

    let active = false;
    let keyPref = ImageZoom.Application.prefs.get(this.PREF_PANEL_KEY);

    switch (keyPref.value) {
      case 1:
        active = aEvent.ctrlKey;
        break;
      case 2:
        active = aEvent.shiftKey;
        break;
      case 3:
        active = aEvent.altKey;
        break;
      default:
        active = true;
        break;
    }

    return active;
  },

  /**
   * Gets the hover time.
   * @return the hover time, 0 by default.
   */
  _getHoverTime : function() {
    this._logger.trace("_getHoverTime");

    let hoverTime = 0;
    let delayPref = ImageZoom.Application.prefs.get(this.PREF_PANEL_DELAY);

    if (delayPref) {
      hoverTime = 1000 * delayPref.value;
    }

    return hoverTime;
  },

  /**
   * Shows the zoom image panel.
   * @param aImageSrc the image source
   * @param aImageNode the image node
   * @param aPage the page constant
   */
  _showZoomImage : function(aImageSrc, aImageNode, aPage) {
    this._logger.trace("_showZoomImage");

    let zoomImageSrc = ImageZoom.FilterService.getZoomImage(aImageSrc, aPage);

    if (null != zoomImageSrc) {
      this._showPanel(aImageNode, zoomImageSrc);
    } else {
      this._closePanel();
    }
  },

  /**
   * Shows the panel.
   * @param aImageNode the image node.
   * @param aImageSrc the image source.
   */
  _showPanel : function(aImageNode, aImageSrc) {
    this._logger.trace("_showPanel");

    // reset previous pic.
    this._panelImage.removeAttribute("src");
    this._panelImage.style.maxWidth = "";
    this._panelImage.style.minWidth = "";
    this._panelImage.style.maxHeight = "";
    this._panelImage.style.minHeight = "";
    this._closePanel();

    // open new pic.
    if (this._panel.state != "open") {
      this._panel.openPopup(aImageNode, "end_before", 30, 30, false, false);
    }
    this._currentImage = aImageSrc;
    this._preloadImage(aImageNode, aImageSrc);
  },

  /**
   * Closes the panel.
   */
  _closePanel : function() {
    this._logger.trace("_closePanel");

    this._currentImage = null;
    this._timer.cancel();
    if (this._panel.state != "closed") {
      this._panel.hidePopup();
    }
  },

  /**
   * Preloads the image.
   * @param aImageNode the image node.
   * @param aImageSrc the image source.
   */
  _preloadImage : function(aImageNode, aImageSrc) {
    this._logger.trace("_preloadImage");

    let that = this;
    let image = new Image();

    image.onload = function() {
      if (that._currentImage == aImageSrc) {
        let pageSide = that._getPageSide(aImageNode);
        let scale = that._getScaleDimensions(image, pageSide);

        that._showImage(aImageSrc, scale);
      }
    };
    image.onerror = function() {
      that._closePanel();
    };

    image.src = aImageSrc;
  },

  /**
   * Gets the page side.
   * @param aImageNode the image node.
   * @return the page side dimension.
   */
  _getPageSide : function(aImageNode) {
    this._logger.trace("_getPageSide");

    let pageWidth = content.document.documentElement.clientWidth;
    let pageSide = pageWidth;
    let pageLeft = 0;
    let pageRight = 0;
    let pageNode = aImageNode;

    while (null != pageNode) {
      pageLeft += pageNode.offsetLeft;
      pageNode = pageNode.offsetParent;
    }
    pageRight = pageWidth - pageLeft - aImageNode.offsetWidth;
    pageSide = (pageLeft > pageRight ? pageLeft : pageRight) - 20;

    return pageSide;
  },

  /**
   * Gets the image scale dimensions to fit the window.
   * @param aImage the image info.
   * @param aPageSide the page side.
   * @return the scale dimensions.
   */
  _getScaleDimensions : function(aImage, aPageSide) {
    this._logger.trace("_getScaleDimensions");

    let pageHeight = content.document.documentElement.clientHeight - 30;
    let imageWidth = aImage.width;
    let imageHeight = aImage.height;
    let scaleRatio = (imageWidth / imageHeight);
    let scale = { width: imageWidth, height: imageHeight };

    if (scale.height > pageHeight) {
      scale.height = pageHeight;
      scale.width = Math.round(scale.height * scaleRatio);
    }
    if (scale.width > aPageSide) {
      scale.width = aPageSide;
      scale.height = Math.round(scale.width / scaleRatio);
    }

    return scale;
  },

  /**
   * Shows the image in the panel.
   * @param aImageSrc the image source.
   * @param aScale the scale dimmensions.
   */
  _showImage : function(aImageSrc, aScale) {
    this._logger.trace("_showImage");

    if (aScale) {
      this._panelImage.style.maxWidth = aScale.width + "px";
      this._panelImage.style.minWidth = aScale.width + "px";
      this._panelImage.style.maxHeight = aScale.height + "px";
      this._panelImage.style.minHeight = aScale.height + "px";
    }
    this._panelImage.src = aImageSrc;
  },

  /**
   * Opens the preferences window.
   */
  openPreferences : function() {
    this._logger.debug("openPreferences");

    let optionsDialog =
      window.openDialog("chrome://imagezoom/content/options.xul",
        "imagezoom-options-window", "chrome,centerscreen");

    optionsDialog.focus();
  },

  /**
   * Toggles the preference value.
   * @param aPage the page constant.
   */
  togglePreference : function(aPage) {
    this._logger.debug("togglePreference");

    ImageZoom.FilterService.togglePageEnable(aPage);
  },

  /**
   * Updates the statusbar menu.
   * @param aPage the page constant.
   */
  _updateStatusbarMenu : function(aPage) {
    this._logger.trace("_updateStatusbarMenu");

    let pageName = ImageZoom.FilterService.getPageName(aPage);
    let pageEnable = ImageZoom.FilterService.isPageEnabled(aPage);
    let menuItemId = "imagezoom-status-menuitem-" + pageName;
    let menuItem = document.getElementById(menuItemId);

    if (null != menuItem) {
      menuItem.setAttribute("checked", pageEnable);
    }
  },

  /**
   * Shows/hides the statusbar button.
   */
  _showStatusBarButton : function() {
    this._logger.trace("_showStatusBarButton");

    let statusbarButton = document.getElementById("imagezoom-statusbar-panel");
    let statusbarPrefValue =
      ImageZoom.Application.prefs.get(this.PREF_STATUSBAR_SHOW).value;

    statusbarButton.hidden = !statusbarPrefValue;
  },

  /**
   * Observes the authentication topic.
   * @param aSubject The object related to the change.
   * @param aTopic The topic being observed.
   * @param aData The data related to the change.
   */
  observe : function(aSubject, aTopic, aData) {
    this._logger.debug("observe");

    if ("nsPref:changed" == aTopic) {
      if (this.PREF_STATUSBAR_SHOW == aData) {
        this._showStatusBarButton();
      } else if (-1 != aData.indexOf(ImageZoom.PrefBranch) &&
                 -1 != aData.indexOf(".enable")) {
        let page =
          aData.replace(ImageZoom.PrefBranch, "").replace(".enable", "");
        let pageConstant = ImageZoom.FilterService.getPageConstantByName(page);

        if (-1 != pageConstant) {
          this._updateStatusbarMenu(pageConstant);
        }
      }
    }
  }
};

window.addEventListener(
  "load", function() { ImageZoomChrome.Overlay.init(); }, false);
window.addEventListener(
  "unload", function() { ImageZoomChrome.Overlay.uninit(); }, false);
