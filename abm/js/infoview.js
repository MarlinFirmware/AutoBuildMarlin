/**
 * Auto Build Marlin
 * abm/js/infoview.js
 *
 * This script runs when the view is created / revealed.
 */

$(function () {

"use strict";

// Singleton pattern
var INFOVIEW = (function() {

  // private variables and functions
  var self;

  var ignore_update = false;  // Ignore the next update message.

  // Return an anonymous object for assignment to ABM
  return {

    // Add a listener for messages sent directly to this view
    init() {
      self = this; // a 'this' for use when 'this' is something else

      // Handle messages sent to this view (window)
      window.addEventListener('message', (e) => { self.handleMessageToUI(e.data); });

      //msg({ type:'hello' });
    },

    /**
     * @brief Handle messages sent from the provider with iview.postMessage(msg)
     * @description Handle 'message' events sent directly to the view.
     * @param {object} m - The message object.
     */
    handleMessageToUI(m) {
      console.log("infoview.js : handleMessageToUI", m);
      switch (m.type) {
        // Receive the list of configurations available for download from GitHub.
        case 'configs':
          console.dir(m.configs);
          break;

        // Update the whole form in response to an external change.
        case 'info':
          if (ignore_update) {
            ignore_update = false;
            return;
          }
          //drawInfo(m.data);
          break;

        // Display an error message
        case 'error':
          $('#error').text(m.text).show().click(() => { $('#error').hide(); });
          break;
      }
    }
  };

})();

INFOVIEW.init();
_msg({ command: 'ui-ready' });

});
