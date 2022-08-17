/**
 * Auto Build Marlin
 *
 * abm/js/webview.js
 *
 * Manage the WebView UI using messaging with abm.js
 * Built on jQuery for easier DOM manipulation.
 *
 */

$(function(){

"use strict";

// Singleton pattern
var ABM = (function(){

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
      $('body').click(() => { $('#error').hide('fast'); });

      //
      // Configurator Buttons show / refresh associated subpanes
      //
      $('.subtabs button').click((e) => {
        abm_pane($(e.target).attr('ref'));
      });

      //
      // Show on Startup checkbox updates the config
      //
      $('#showy input').change((e) => {
        msg({ command:$(e.target).attr('name'), value:e.target.checked });
      });

      //
      // Add a handler for webview.postMessage
      //
      window.addEventListener('message', this.handleMessage);

      // Activate the "Build" tool
      msg({ command:'tool', tool:'build' });

      // Un-hide the first subpane
      abm_pane($('.subpanes>div').first().attr('class'));

    },

    //
    // Calls to postMessage arrive here:
    //
    handleMessage(event) {
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
            if (m.uri) {
              const $a = $('<a>').attr('href', '#').text(m.val);
              $a.click((e) => {
                e.preventDefault();
                vscode.postMessage({ command: 'openfile', uri:m.uri });
              });
              $dest.append($a);
            }
            else
              $dest.text(m.val);
            $dest.show();
          }
          //console.log(`Setting ${m.tag} to ${m.val}`);
          break;

        case 'text':
          $('#debug-text').show().children('pre').text(m.text);
          break;

        // postError()
        case 'error':
          $err.removeClass('warning').html(m.error).show('fast');
          break;
        // postWarning()
        case 'warning':
          $err.addClass('warning').html(m.warning).show('fast');
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
          //   .native    - Native (Runnable)
          //   .busy      - Show "Please Wait..." State
          //   .exists    - The env build folder exists
          //   .completed - Build Completed
          //   .filename  - The built binary Filename (if it exists)
          //   .stamp     - Timestamp Message
          const $env_td = $('#info-envs').html(''),
                $env_rows_src = $('#env-rows-src'),
                $envs_table = $('<table>');

          let has_progress = false;
          $.each(m.val, function(i,v) {
            // Copy the template <table>, merging the env name. The <span> is allowed here!
            const $env_table_copy = $($env_rows_src.html().replace(/<env>/g, v.name));
            let $erows = $env_table_copy.find('tr').addClass(`env-${v.name}`);

            // Set the env name in the new button row
            $erows.find('.env-name').text(v.name + (v.note ? ` ${v.note}` : ''));

            // Set env row classes and env caption
            let caption = '';
            if (v.debug) $erows.addClass('debug');
            if (v.native) $erows.addClass('native');
            if (v.busy) {
              $erows.addClass('busy');
              caption = 'Please Wait…';
              has_progress = true;
            }
            if (v.exists) {
              $erows.addClass('exists');
              if (!v.busy) {
                caption = 'Built ';
                if (v.filename !== undefined)
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
msg({ command: 'ui-ready' });

});
