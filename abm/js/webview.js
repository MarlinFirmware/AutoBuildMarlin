/**
 * Auto Build Marlin
 *
 * webview.js
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
      const $err = $('#error');
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
        msg({ command:'show_on_start', show:e.target.checked });
      });

      //
      // Calls to postMessage arrive here:
      //
      window.addEventListener('message', event => {
        const m = event.data; // JSON sent by the extension
        switch (m.command) {

          case 'tool': abm_tool(m.tool); break;

          case 'pane': abm_pane(m.pane); break;

          case 'define':
            // Update a single define element in the UI
            break;

          // postValue()
          case 'set':
            const $item = $('#info-' + m.tag);
            if (m.val) $item.text(m.val); else $item.hide();
            if (0) console.log(`Setting ${m.tag} to ${m.val}`);
            break;

          case 'text':
            $('#debug-text').show().children('pre').text(m.text);
            break;

          // postError
          case 'error':
            $err.removeClass('warning').html(m.error).show('fast');
            break;
          // postWarning
          case 'warning':
            $err.addClass('warning').html(m.warning).show('fast');
            break;
          case 'start':
            $('#showy input[name="show_on_startup"]').prop('checked', m.start);
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
              if (v.native) $erows.addClass('native');
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
                  else
                    caption = `<a class="reveal" href="#" title="Reveal" onclick="msg({ command:'reveal', env:'${v.name}' })">📁</a>&nbsp; ${caption}`;
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
      });

      // Activate the "Build" tool
      msg({ command:'tool', tool:'build' });

      // Un-hide the first subpane
      abm_pane($('.subpanes>div').first().attr('class'));

    },

    EOF: null
  };

})();

ABM.init();
msg({ command: 'ui-ready' });

});
