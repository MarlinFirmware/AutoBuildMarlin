/**
 * Auto Build Marlin
 *
 * webview.js
 *
 * Manage the WebView UI using messaging with extension.js
 * Built on jQuery for easier DOM manipulation.
 * 
 */

$(function(){

"use strict";

// Singleton pattern
var ABM = (function(){

  // private variables and functions
  var self;

  // Return an anonymous object for assignment to ABM
  return {

    // public data members

    poffset: 0,
    ptimer: null,

    // public methods

    init: function() {
      self = this; // a 'this' for use when 'this' is something else

      const $err = $('#error');
      $('body').click(() => { $('#error').hide('fast'); });

      //
      // Calls to postMessage in extension.js arrive here:
      //

      window.addEventListener('message', event => {
        const m = event.data; // JSON sent by the extension
        switch (m.command) {
          case 'tool':
            abm_show(m.tool);
            break;
          case 'define':
            // Update a single define element in the UI
            break;
          case 'set':
            const $item = $('#info-' + m.tag);
            if (m.val) $item.text(m.val); else $item.hide();
            if (0) console.log(`Setting ${m.tag} to ${m.val}`);
            break;
          case 'text':
            $('#debug-text').show().children('pre').text(m.text);
            break;
          case 'error':
            $err.html(m.error).show('fast');
            break;
          case 'envs':
            // We finally got environments!
            // Make some buttons...
            const $env_td = $('#info-envs').html(''),
                  $env_rows_src = $('#env-rows-src'),
                  $envs_table = $('<table>');

            let has_progress = false;
            $.each(m.val, function(i,v) {
              // Copy the template <table>, merging the env name. The <span> is allowed here!
              const $env_table_copy = $($env_rows_src.html().replace(/<env>/g, v.name));
              let $erows = $env_table_copy.find('tr').addClass(`env-${v.name}`);

              // Set the env name in the new button row
              $erows.find('.env-name').text(v.name);

              // Set env row classes and env caption
              let caption = '';
              if (v.debug) $erows.addClass('debug');
              if (v.busy) {
                $erows.addClass('busy');
                caption = 'Please Wait…';
                has_progress = true;
              }
              if (v.exists) {
                $erows.addClass('exists');
                if (!v.busy) {
                  caption = 'Last build ' + v.stamp;
                  if (!v.completed) {
                    $erows.addClass('incomplete');
                    caption += ' (incomplete)';
                  }
                }
              }
              $erows.find('.env-more span').html(caption);

              $envs_table.append($erows);
            });

            if (self.ptimer) { clearInterval(self.ptimer); self.ptimer = null; }
            if (has_progress) {
              self.ptimer = setInterval(() => {
                self.poffset = (self.poffset + 30) % 32;
                $('body').get(0).style.setProperty('--abm-progress-offset', self.poffset + 'px');
              }, 50);
            }

            $env_td.append($envs_table);
            break;
        }
      });

      msg({ command:'tool', tool:'build' }); // To un-hide the build view

    },

    EOF: null
  };

})();

ABM.init();
msg({ command: 'ui-ready' });

});
