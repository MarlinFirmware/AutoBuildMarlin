/**
 * Auto Build Marlin
 *
 * abm/js/abmview.js
 *
 * Manage the WebView UI using messaging with abm.js
 * Built on jQuery for easier DOM manipulation.
 *
 */

$(function(){

"use strict";

// Singleton pattern
var ABM = (() => {

  // private variables and functions
  var self, poffset = 0, ptimer = null;
  const $err = $('#error');

  // Return an anonymous object for assignment to ABM
  return {

    // public data members
    // ...

    // public methods

    init() {
      self = this; // a 'this' for use when 'this' is something else

      //
      // Hide the Error message when clicked
      //
      $('body').click(() => { $err.hide(25); });

      //
      // Configurator Buttons show / refresh associated subpanes
      //
      $('.subtabs button').click((e) => {
        abm_pane($(e.target).attr('ref'));
      });

      //
      // Checkboxes like "Show on Startup" send a command to update settings
      //
      $('#showy input').change((e) => {
        msg({ command:$(e.target).attr('name'), value:e.target.checked });
      });

      //
      // Watch for option key events and change the title of all button.clean elements
      //
      $(document).keydown((e) => {
        if (e.key === 'Alt') $('button.clean').addClass('opt');
      });
      $(document).keyup((e) => {
        if (e.key === 'Alt') $('button.clean').removeClass('opt');
      });

      //
      // Add a handler for webview.postMessage
      //
      window.addEventListener('message', this.handleMessageToUI);

      // Activate the "Build" tool
      msg({ command:'tool', tool:'build' }); // abm.js:handleMessageFromUI

      // Un-hide the first subpane
      abm_pane($('.subpanes>div').first().attr('class'));

    },

    //
    // Calls to abm.postMessage or pv.postMessage from abm.html arrive here:
    //
    handleMessageToUI(event) {
      const m = event.data; // JSON sent by the extension
      //console.log("ABM View got message:"); console.dir(m);
      switch (m.command) {

        case 'tool': abm_tool(m.tool); break;

        case 'pane': abm_pane(m.pane); break;

        case 'define':
          // Update a single define element in the UI
          break;

        // postValue()
        case 'info':
          var $dest = $('#info-' + m.tag).text('');
          if (!m.val)
            $dest.hide();
          else {
            function createItem(text, uri) {
              const element = uri
                ? $('<a>', { href: '#' }).text(text).on('click', e => {
                    e.preventDefault();
                    _msg({ command: 'openfile', uri });
                  })
                : document.createTextNode(text);
              return element;
            }

            const items = Array.isArray(m.val)
              ? m.val.map(v => createItem(v.text, v.uri))
              : [createItem(m.val, m.uri)];

            items.forEach(item => $dest.append(item));
            $dest.show();
          }
          //console.log(`Setting ${m.tag} to ${m.val}`);
          break;

        case 'text':
          $('#debug-text').show().children('pre').text(m.text);
          break;

        case 'noerror': $err.hide(25); break;

        // postError()
        case 'error':
          $err.removeClass('warning').html(m.error).show(50);
          break;
        // postWarning()
        case 'warning':
          $err.addClass('warning').html(m.warning).show(50);
          break;

        // Set a checkbox state
        case 'check':
          $(`#showy input[name="${m.name}"]`).prop('checked', m.state);
          break;

        case 'envs':
          // Environments for building the current Configuration
          //
          // m.val = an array of env objects:
          //   .name      - Environment Name
          //   .debug     - Debug Allowed
          //   .prefer    - Preferred Env
          //   .native    - Native (Runnable)
          //   .busy      - Show "Please Wait..." State
          //   .exists    - The env build folder exists
          //   .completed - Build Completed
          //   .filename  - The built binary Filename (if it exists)
          //   .stamp     - Timestamp Message
          const $env_td = $('#info-envs').html(''),
                $env_rows_src = $('#env-rows-src'),
                $envs_table = $('<table>');

          let has_progress = false, has_usb = false;
          $.each(m.val, function(i,v) {
            // If the name ends with USB set the flag
            if (v.name.match(/.+_USB.*/)) has_usb = true;

            // Copy the template <table>, merging the env name. The <span> is allowed here!
            const $env_table_copy = $($env_rows_src.html().replace(/<env>/g, v.name));
            let $erows = $env_table_copy.find('tr').addClass(`env-${v.name}`);

            // Set the env name in the new button row
            $erows.find('.env-name').text(v.name + (v.note ? ` ${v.note}` : ''));

            // Set env row classes and env caption
            let caption = '';
            if (v.name.match(/.+maple.*/)) $erows.addClass('maple');
            if (v.debug) $erows.addClass('debug');
            if (v.native) $erows.addClass('native');
            if (v.prefer) $erows.addClass('prefer');
            if (v.busy) {
              $erows.addClass('busy');
              caption = 'Please Wait…';
              has_progress = true;
            }
            if (v.exists) {
              $erows.addClass('exists');
              if (!v.busy) {
                caption = 'Built ';
                if ('filename' in v)
                  caption += `"${v.filename}" `;
                caption += v.stamp;
                if (!v.completed) {
                  $erows.addClass('incomplete');
                  caption += ' (incomplete)';
                }
                else
                  caption = `<a class="reveal" href="#" title="Reveal" onclick="msg({ command:'reveal', env:'${v.name}' })"><span>📁</span>&nbsp; ${caption}</a>`;
              }
            }
            $erows.find('.env-more span').html(caption);

            $envs_table.append($erows);
          });

          if (has_usb) $env_td.append($('<div id="usb-note">* "USB" Environments allow mounting the SD Card on the Host PC.</div>'));

          if (ptimer) { clearInterval(ptimer); ptimer = null; }
          if (has_progress) {
            ptimer = setInterval(() => {
              poffset = (poffset + 30) % 32;
              $('body').get(0).style.setProperty('--abm-progress-offset', poffset + 'px');
            }, 50);
          }

          $env_td.append($envs_table);
          break;
      }
    },

    EOF: null
  };

})();

ABM.init();
msg({ command:'ui-ready' }); // abm.js:handleMessageFromUI

});
