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
  var self,
      pi2 = Math.PI * 2,
      my_flag = false,
      $cfg = $('#config_text'),
      test_count = 0;

  // Return an anonymous object for assignment to ABM
  return {

    // public data members

    logging: 5,

    // public methods

    init: function() {
      self = this; // a 'this' for use when 'this' is something else

      const $counter = $('#test-counter>span');
      setInterval(() => { $counter.html(test_count++); }, 200);

      const $err = $('#error');
      $('body').click(() => { $('#error').hide('fast'); });

      //
      // Calls to postMessage in extension.js arrive here:
      //

      window.addEventListener('message', event => {
        const m = event.data; // JSON sent by the extension
        switch (m.command) {
          case 'define':
            break;
          case 'define':
            // Update a single define element in the UI
            break;
          case 'set':
            $('#info-' + m.tag).text(m.val);
            break;
          case 'reset':
            test_count = 0;
            $counter.text(test_count);
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
            var $env_box = $('#info-envs'),
                $btn_src = $('#abm-button-src');

            $env_box.html('');
            $.each(m.val, function(i,v) {
              let btn_code = $btn_src.html().replace(/<env>/g, v.name),
                  $btn_scrub = $(btn_code),
                  $ediv = $('<div>').addClass(['abm-env',`env-${v.name}`]);

              $btn_scrub.find('.env-name').text(v.name);
              let more_info = '';
              if (v.busy) {
                $ediv.addClass('busy');
                more_info = 'Please wait…';
              }
              if (v.exists) {
                $ediv.addClass('exists');
                if (!v.busy) {
                  more_info = `Last build ${v.stamp}`;
                  if (!v.completed) {
                    $ediv.addClass('incomplete');
                    more_info += ` (incomplete)`;
                  }
                }
              }
              $btn_scrub.find('.env-more').html(more_info);
              $ediv.append($btn_scrub).appendTo($env_box);
            });
            break;
        }
      });

      msg({ command:'tool', tool:'build' });
      //$('#abm-build').show();

    },

    /**
     * Act on a thing
     */
    DoSomething: function(txt) {
    },

    EOF: null
  };

})();

ABM.init();
msg({ command: 'ui-ready' });

});
