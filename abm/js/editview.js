/**
 * Auto Build Marlin
 * abm/js/editview.js
 *
 * This script runs when...
 *  - A Configuration.h or Configuration_adv.h file is first opened in an editor window/tab.
 *  - The tab is revealed after being hidden.
 *
 * The webview in the new tab already contains the base HTML, so we:
 *  - Add a listener to handle 'message' events sent by the view's controller.
 *  - Set up the empty webview with event handlers on the header form fields.
 *  - Convert the file text to a data structure for editing, store in edit session.
 *  - Do the initial form build based on the data structure.
 *
 * Then it checks for a stored state.
 *  - On the first load of the closed editor, the state is empty.
 *    The document will be sent as a message for us to handle.
 *  - When switching from another tab, it contains the last-saved parsed data,
 *    (we assume there has been no unseen change to the text document).
 *
 * Form and data handling:
 *  - Filter fields change the visual appearance based on filter options.
 *  - Whenever a change is made to a config option via the form, we update the
 *    data structure and send a message to the provider to update the document
 *    text. The provider sends an "update" message back to the webview, which
 *    recreates the form again from the altered text.
 *
 * External events:
 *  - If the document is altered externally, the provider sends an "update" message
 *    with the new text.
 *
 * TODO:
 *  - Make pullup/pulldown items mutually-exclusive in the form.
 *  - Show multiple fields for arrays, with axis labels, distinct E, etc.
 *  - Add "Save" button (and export options) to the top of the form.
 *  - Get a symbols font or use some SVGs to dress up the legends in place of emojis.
 *  - Try some alternative styles, such as full-width legend header.
 *  - Try colorizing/edge-marking the depths. The div could indent in place of the label, other things remaining equal.
 *  - Group distinct items into single inputs that manipulate the underlying fields.
 *    For example, the kinematics are mutually exclusive, so they ought to be radio buttons.
 *    When submitting this kind of change, send the enabled and disabled items to the provider in a single 'change' message.
 *  - Process #undef by setting the range-end for all previous instances. Don't change 'enabled'.
 *    This retains all the instances in the structure, which is good to preserve the schema.
 * To Test:
 *  - External edit causes VSCode to ask "Reload?" or reload automatically.
 */
'use strict';

$(function () {

  // Type out some text into a container element.
  $.fn.extend({
    typeout: function (text, done_fn) {
      var elem = this.get(0);

      function done(fn) {
        if ('interval' in elem) clearInterval(elem.interval);
        if ('timeout' in elem) clearTimeout(elem.timeout);
        delete elem.interval, elem.timeout;
        if (fn) {
          elem.classList.remove('typing');
          fn();
        }
      }

      done();
      elem.classList.add('typing');
      elem.innerHTML = '&nbsp;';

      const style = 'rough';

      var i = 0;
      if (style == 'smooth') {
        // Smoothly type out the text one character at a time.
        const period = 20;
        elem.interval = setInterval(function () {
          if (!['&nbsp;', text.slice(0, i)].includes(elem.innerHTML))
            done();
          else if (i >= text.length)
            done(done_fn);
          else
            elem.innerHTML = text.slice(0, ++i);
        }, period);
      } else {
        // Recursive with random timeouts.
        const typeout = (min_interval, max_interval) => {
          // Abort if the text in the element was changed externally.
          if (!['&nbsp;', text.slice(0, i)].includes(elem.innerHTML))
            done();
          else if (i >= text.length)
            done(done_fn);
          else {
            elem.innerHTML = text.slice(0, ++i);
            const period = Math.floor(Math.random() * (max_interval - min_interval)) + min_interval;
            elem.timeout = setTimeout(() => { typeout(min_interval, max_interval); }, period);
          }
        };
        typeout(20, 50);
      }
    }
  });

  String.prototype.toTitleCase = function () {
    return this.replace(/\b([A-Z])(\w+)\b/gi, (_, p1, p2) => { return p1.toUpperCase() + p2.toLowerCase(); })
  }
  String.prototype.toMarlinCase = function () {
    return this.replace(/(\w)(jerk|step|temp|bed|chamber|probe)/gi, '$1 $2')
              .replace(/\b(\w)(min|max|point)\b/gi, '$1 $2')
              .replace(/toppull/gi, 'top pull')
              // Title Case
              .toTitleCase()
              // Uppercase Words
              .replace(/\b(..?|adc|azsmz|beez|biqu|btt|cnc|ctc|elb|led|lin|mpe|psu|ptc|rts|sav|soc|spi|ubl|usb|utf)\b/gi, (m) => { return m.toUpperCase(); })
              // Uppercase Anywhere Sequences
              .replace(/xyuv|g?lcd|yhcb|dgus|dwin|eeprom|ftdi|gfx|lvgl|mks|pid|pwm|ssd|tft|wyh|rgbw?|oled|pca\d+|uuid|HD44\d+|(sc|tp)ara|cr\d+/gi, (m) => { return m.toUpperCase(); })
              // Uppercase Beginning Sequences
              .replace(/\b([xyz]{2,3}|blt|mpc|sd)/gi, (m) => { return m.toUpperCase(); })
              // Uppercase Ending Sequences
              .replace(/([xyz]{2,3}|dlp|mmu|sd|hw|sw|ui)\b/gi, (m) => { return m.toUpperCase(); })
              // Uppercase Numerical parts
              .replace(/\b[a-z]+\d+[a-z]*\b/gi, (m) => { return m.toUpperCase(); })
              // Title Case Strings and Substrings
              .replace(/(count|pixel|print|\b(ON|NO|K[PID])\b)/g, (m) => { return m.toTitleCase(); })
              // Lowercase words
              .replace(/\b(and|at|mm|ms|in|of|or)\b/gi, (m) => { return m.toLowerCase(); })
              // Special cases
              .replace(/ per (unit|step)\b/gi, '-per-$1')
              .replace(/\bmm M\b/, '(mm/min)')
              .replace(/\b0 0\b/, '0,0')
              .replace(/\bH\b/, '.h')
              .replace(/ (V?.) (.)$/, ' $1.$2')
              .replace('Gcode', 'G-code').replace(/\bLeds\b/, 'LEDs').replace('nkm', 'nkM')
              .replace(/(\w)temp\b/g, '$1Temp').replace('Reprap', 'RepRap').replace('eboard', 'eBoard')
              .replace(/\bus\b/gi, 'µs');
  }
  String.prototype.unbrace     = function () { return this.replace(/[\[\]]/g, ''); }
  String.prototype.toLabel     = function () { return this.unbrace().replace(/_/g, ' ').toMarlinCase(); }
  String.prototype.toID        = function () { return this.unbrace().replace(/_/g, '-').toLowerCase(); }
  String.prototype.sectID      = function () { return this.replace(/[^\w]+/g, '-').toLowerCase(); }
  String.prototype.camelToID   = function () { return this.unbrace().replace(/([a-z])([A-Z0-9_])/g, '$1_$2').replace(/_/g, '-').toLowerCase(); }

  Array.prototype.toggle = function (val, tf) {
    const hv = this.includes(val);
    if (tf && !hv)
      this.push(val);
    else if (!tf && hv) {
      // Remove the value from the array
      for (let i = this.length - 1; i >= 0; i--)
        if (this[i] === val) this.splice(i, 1);
    }
    return this;
  };

  var verbose = false;
  function log(s, d) {
    if (!verbose) return;
    console.log(`[editview] ${s}`);
    if (d !== undefined) console.dir(d);
  }
  function log_(s, d) {
    const oldverbose = verbose;
    verbose = true;
    log(s, d);
    verbose = oldverbose;
  }

  // A copy of ConfigSchema for local usage
  var schema = ConfigSchema.newSchema(),
      config_filter = { terms: '', show_comments: true, show_disabled: true, collapsed: [] },
      result_index = 0;

  // We need getState, setState, and postMessage.
  const vscode = acquireVsCodeApi();

  // Ignore the next update message.
  var ignore_update = false;

  // Collect changes and post the collection
  var multi_update = false, changes = [];
  function start_multi_update() {
    multi_update = true;
    changes = [];
  }
  function end_multi_update() {
    multi_update = false;
    ignore_update = true;
    vscode.postMessage({ type:'multi-change', changes }); // editor.js:handleMessageFromUI
  }

  // A filter text box to filter the list of options.
  const $filter = $('#filter');

  // Bind a keyboard handler to the html element.
  $('html').bind("keydown keyup", e => {
    // Look for the F key in combination with the system meta key.
    if (e.keyCode == 70 && e.metaKey) {
      // Focus the filter text box if the filter is not already focused.
      if (!$filter.is(':focus')) $filter.focus();
      // Prevent the default behavior.
      e.preventDefault();
    }
  });

  // The container for the Configuraton form.
  const $formdiv = $('#config-form');

  // Set up event handlers on the header form fields.
  function initConfigForm() {
    // Make sure no forms are able to submit.
    $('form').bind('submit', (e) => { return false; });

    // Add a change listeners to the filter box.
    var filterTimer = null;
    $filter.bind('input', (e) => {
      clearTimeout(filterTimer);
      if (e.originalEvent.inputType === undefined) // Clear widget on 'search' input type
        applyNewFilter($filter.val());
      else {
        log(`inputType: ${e.originalEvent.inputType}`);
        filterTimer = setTimeout(() => { applyNewFilter($filter.val()); }, 250);
      }
    });

    // A checkbox to show/hide comments in the editor.
    var $show_comments = $('#show-comments');
    $show_comments.bind('change', (e) => { applyShowComments($(e.target).is(':checked')); });

    // A checkbox to show/hide comments in the editor.
    var $show_disabled = $('#show-disabled');
    $show_disabled.bind('change', (e) => { applyShowDisabled($(e.target).is(':checked')); });

    // A button to test sending messages to the extension.
    const $button = $('#hello-button');
    $button.find('button').bind('click', () => {
      vscode.postMessage({ type: 'hello' }); // editor.js:handleMessageFromUI
    });
  }

  // Update state from the stored data structure and filter.
  // TODO: Use the state in the provider instead.
  function saveWebViewState() {
    const data = { data: schema.data, filter: config_filter };
    log('saveWebViewState', data);
    vscode.setState(data);
  }

  //
  // Hide or show form fields based on their 'evaled' property.
  // Called immediately after an item is edited.
  //
  function refreshVisibleItems() {
    // Each .line item represents a single #define line in the config,
    // as gathered by the schema class. Each .line also has a class ".sid-##"
    // containing the serial ID for the option.
    $('#config-form div.line').each((i, div) => {
      // Direct access to the schema data structure
      const data = div.inforef;
      // Set .nope on options that are disabled based on other options
      $(div).toggleClass('nope', data.evaled !== undefined && !data.evaled);
    });
    hideEmptySections(true);
  }

  /**
   * @brief Update an option, persistent state, and document.
   * @description Update an option, save the full state, send the change to the document.
   *              Called indirectly from the form event handlers.
   * @param {dict} optref - The option to update.
   * @param {dict} fields - The fields to replace in the option.
   */
  function commitChange(optref, fields) {
    // Assign new field values to the option reference
    Object.assign(optref, fields);

    // Is the value / enabled state different from the original?
    const dirty = optref.orig.enabled != optref.enabled || (optref.value !== undefined && optref.orig.value != optref.value);
    optref.dirty = dirty;

    // Log and update UI
    log("commitChange", [ optref, fields ]);
    $(`div.line.sid-${optref.sid}`).toggleClass('dirty', dirty);

    // Refresh UI and state
    schema.refreshAllRequires();
    //schema.refreshRequiresAfter(optref.name == 'EXTRUDERS' ? 1 : optref.sid);
    refreshVisibleItems();
    saveWebViewState();

    // This update should be ignored when it comes back from onDidChangeTextDocument -> updateWebview
    const msg = { type: 'change', data: optref };
    if (multi_update)
      changes.push(msg);
    else {
      ignore_update = true;
      vscode.postMessage(msg); // editor.js:handleMessageFromUI
    }
  }

  /**
   * @brief Enable/disable an option (e.g., based on a checkbox).
   * @description Enable/disable an option, save the full state, send the change to the document.
   * @param {schema} optref - A reference to the option's dictionary.
   * @param {bool} enabled - A new 'enabled' property value for the option.
   */
  function applyEnableChange(optref, enabled) { commitChange(optref, { enabled: enabled }); }

  function applyEnableCheckbox($cb) {
    const $line = $cb.closest('.line'), // Parent div.line of the checkbox.
        enabled = $cb.is(':checked') || $cb.hasClass('checked');  // State based on the checkbox or class.

    // Change the field in the data structure now,
    // since the receiver can't change it directly.
    applyEnableChange($line[0].inforef, enabled);
    $line.toggleClass('disabled', !enabled);
  }

  /**
   * @brief Update the value of an option (e.g., based on a text field, selector, etc.).
   * @description Update an option value, save the full state, send the change to the document.
   * @param {schema} optref - A reference to the option's dictionary.
   * @param {bool} value - A new value for the option.
   */
  function applyValueChange(optref, value) { commitChange(optref, { value: value }); }

  //! @brief Handle a checkbox change event.
  function handleCheckbox(e) {
    applyEnableCheckbox($(e.target));
  }

  //! @brief Handle a checkbox event in a mutual-exclusive group.
  function handleCheckboxGroup(e) {
    start_multi_update();

    const cb = e.target, $cb = $(cb), // The checkbox.
          $sdiv = $('div.section-inner'), // Some groups cross sections
          clas = $cb.prop('class');

    $sdiv.find(`.${clas}:checked`).each(function(i,o) {
      if (o === cb) return;
      const $acb = $(o);
      $acb.prop('checked', false);
      applyEnableCheckbox($acb);
    });
    applyEnableCheckbox($cb);

    end_multi_update();
  }

  //! @brief Handle enabling an item in a mutual-exclusive "radio button" group.
  function handleRadioGroup(e) {
    start_multi_update();

    const $rb = $(e.target),        // The clicked radio button
          name = $rb.prop('name');  // Radio group name

    $rb.removeClass('checked');
    $(`input[name="${name}"].checked`).each(function(i,o) {
      const $arb = $(o);
      $arb.removeClass('checked');
      applyEnableCheckbox($arb);
    });
    $rb.addClass('checked');
    applyEnableCheckbox($rb);

    end_multi_update();
  }

  //! @brief Apply a field change event now or soon.
  var editTimer = null;
  function handleEdit(e, delayed) {
    const $field = $(e.target),
          $line = $field.closest('.line'),
          value = $field.val();
    log(`handleEditField: ${value}`, $line[0]);
    if (delayed) {
      clearTimeout(editTimer);
      editTimer = setTimeout(() => { applyValueChange($line[0].inforef, value); }, 500);
    }
    else
      applyValueChange($line[0].inforef, value);
  }

  /**
   * @brief Handle a change event on a text field.
   * @description Based on the field class, check the type value for proper formatting.
   *              and prevent it from being empty.
   */
  function handleEditField(e)   {
    const $e = $(e.target), val = $e.val();
    var newval = val;
    if ($e.hasClass('enum')) {
      // Allow anything but don't let it be empty.
      newval = newval.trim();
      if (newval == '') newval = '_';
    }
    else if ($e.hasClass('int')) {
      newval = Math.floor(newval.replace(/[^\d.]/g, '')).toString();
      if (newval == 0 || newval == 'NaN') newval = '0';
    }
    else if ($e.hasClass('float')) {
      newval = newval.replace(/[,.]+/g, '.')
                     .replace(/(.*\..+)\./g, '$1')
                     .replace(/[^\d.f]/g, '')
                     .replace(/(.+)f(.+)/g, '$1$2');
      if (newval == '') newval = '0.0f';
      if (!/^\d*\.?\d*f?$/.test(newval))
        newval = newval.replace(/^(\d+)\.*$/, '$1.0f');
    }
    else if ($e.hasClass('int-arr') || $e.hasClass('float-arr')) {
      newval = newval.trim().replace(/^(.+\}).+/, '$1');
      if (newval == '' || newval[0] != '{') newval = '{ ' + newval;
      if (newval[newval.length - 1] != '}') newval = newval + ' }';
    }
    else if ($e.hasClass('string')) {
      // A string must start and end with double-quotes.
      newval = newval.trim();
      if (newval == '' || newval[0] != '"') newval = '"' + newval;
      if (newval[newval.length - 1] != '"') newval = newval + '"';
    }
    else if ($e.hasClass('char')) {
      // A char must be a single character in single-quotes.
      newval = newval.trim();
      if (newval == '' || newval == "'" || newval == "''")
        newval = "' '";
      else if (newval == "'\\'")
        newval = "'\\''";
      else if (newval != "'\\''")
        newval = newval.replace(/^\s*'?([^']).*/, "'$1'");
    }
    if (newval != val) {
      const sel = [$e[0].selectionStart, $e[0].selectionEnd ];
      $e.val(newval);
      $e[0].setSelectionRange(sel[0], sel[1]);
    }
    handleEdit(e, true);
  }
  function handleSelectField(e) { handleEdit(e, false); }
  function handleBoolField(e)   {
    const $cb = $(e.target),
          $line = $cb.closest('.line'),
          info = $line[0].inforef,
          opts = info.type == 'state' ? ['LOW', 'HIGH'] : [false, true];
    applyValueChange($line[0].inforef, opts[$cb.is(':checked') ? 1 : 0]);
  }

  /**
   * Hide all sections with no visible items.
   */
  function _hideEmptySections($target=$formdiv) {
    const $sects = $target.find('fieldset.section');
    $sects.addClass('hide');    // Hide all sections by default

    const selector = 'div.line:not(.hide):not(.nope)' + (config_filter.show_disabled ? '' : ':not(.disabled)');

    // Count up visible items in each section. Re-show non-empty sections.
    let count = 0;
    for (const sect of $sects) {
      // Select all div.line without class 'hide' or 'nope'
      const $lines = $(sect).find(selector), len = $lines.length
      if (len > 0) {
        $(sect).removeClass('hide');
        count += len;
      }
    }
    return count;
  }

  /**
   * Hide all sections with no visible items.
   */
  function hideEmptySections(hasterms, $target=$formdiv) {
    const count = _hideEmptySections($target);
    $('#zero-box').removeClass('show');
    if (count > 0)
      $('#filter-count').text(`${count} Setting${count != 1 ? 's' : ''}${hasterms ? ' Found' : ''}`);

    // If there's no filter we're done.
    if (!hasterms) return;

    // No matches and has terms? Show the error box.
    if (count == 0) {
      const noResults = [ '*',
        'No results', '0 Results', 'None found', 'No match', 'Zippo', 'Zilch', 'Nada', 'Bupkiss', 'Empty Result Set', '(NULL)',
        'Access Denied', "#You shouldn't have come back, Flynn.", "#That isn't going to do you any good, Flynn.", "#I'm afraid you...",
        "#Stop, Flynn. You realize I can't allow this.", "#TERMINATE CONTROL MODE", "#ACTIVATE MATRIX STORAGE",
        "#You're entering a big error, Flynn...", "#I'm going to have to put you on the Game Grid."
      ];
      const quip = noResults[result_index = (result_index + 1) % noResults.length];
      if (quip == '*')
        startGrid();
      else {
        const $zb = $('#zero-box').addClass('show');
        if (quip.charAt(0) == '#')
          $zb.typeout(quip.slice(1));
        else
          $zb.text(quip);
      }
    }
  }

  /**
   * Apply the filter terms by hiding non-matching items.
   * Hide any sections with no visible items.
   */
  function applyFilter(terms, $target=$formdiv) {
    $('#zero-box').removeClass('show');
    $('#filter-count').text('');
    var $lines = $target.find(`div.line`);

    const hasterms = terms.trim().length >= 3;
    if (hasterms) {
      $lines.addClass('hide');                                  // Hide all lines by default
      const words = terms.toLowerCase().split(' ');             // Split up the filter terms into words
      for (let word of words)                                   // Get only lines that have all words in their id
        if (word.length > 1)
          $lines = $lines.filter(`[id*="${word}"]`);
    }

    $lines.removeClass('hide');
    hideEmptySections(hasterms, $target);

    log(`Applied filter '${terms}'`);
  }

  // Apply a new filter from the filter field.
  function applyNewFilter(terms, $target=$formdiv) {
    config_filter.terms = terms;
    saveWebViewState();
    applyFilter(terms, $target);
  }

  // Save the filter in the window. Unless flagged, also set the filter fields.
  function initFilter(filter, field=true) {
    config_filter = filter;
    $filter.val(filter.terms);
    $('#show-comments').prop('checked', filter.show_comments);
    $('#show-disabled').prop('checked', filter.show_disabled);
  }

  // Apply the "show comments" checkbox filter by hiding/showing comments.
  function showComments(show, $target=$formdiv) {
    $target.toggleClass('hide-comments', !show);
  }
  function applyShowComments(show) {
    config_filter.show_comments = show;
    showComments(show);
    saveWebViewState();
  }

  // Apply the "show disabled" checkbox filter by hiding/showing disabled options.
  function showDisabled(show, $target=$formdiv) {
    $target.toggleClass('hide-disabled', !show);
    // Hide sections with no visible items.
    hideEmptySections(false);
  }
  function applyShowDisabled(show) {
    config_filter.show_disabled = show;
    showDisabled(show);
    saveWebViewState();
  }

  function addOptionSelect(item, $inner) {
    if ($inner.find(`.section.${item.section.sectID()}`)) return;
  }

  /**
   * @brief Add a single option to the form as one or more input fields inside a div
   * @param {item} data : An option to add to the form
   * @param {jquery} $inner : The element to append to
   */
  const option_defaults = { type: '', value: '', options: '', group: '', depth: 0, dirty: false, evaled: true };
  function addOptionLine(data, $inner) {
    // Add defaults for missing fields
    const item = { ...option_defaults, ...data };

    // Get some option properties
    const name = item.name, ena = item.enabled, val = item.value,
            ts = item.type.split('['), type = ts[0],
        tclass = type + (ts.length > 1 ? '-arr' : ''),
      isswitch = type == 'switch',
         group = item.group;

    //log(`${name} = ${val}`);

    // Prepare the div, label, label text, and option enable checkbox / radio
    const $linediv = $("<div>", { id: `-${name.toID()}-${item.sid}`, class: `line sid-${item.sid}` }),
        $linelabel = $("<label>", { class: "opt" }),
        $labelspan = $("<span>").text(name.toLabel()),
           $linecb = $("<input>", { type: "checkbox", name, tabindex: 9999, checked: ena }).bind("change", group ? handleCheckboxGroup : handleCheckbox);

    if (group) $linecb.addClass(`radio-${group}`);

    $linediv[0].inforef = data;
    $linediv.addClass(`d${item.depth}`);
    if (item.dirty) $linediv.addClass('dirty');
    if (!item.evaled) $linediv.addClass('nope');
    if (!ena) $linediv.addClass("disabled");
    $linelabel.append($linecb).append($labelspan);
    $linediv.append($linelabel);
    if (!isswitch) {
      if (type == 'state') {
        const $cl = $("<label>", { class: 'bool' }),
          $cb = $('<input>', { type: 'checkbox', checked: val == 'HIGH', value: 'true' }).bind('change', handleBoolField),
          $sl = $("<div>", { class: 'slider round' }),
          $sp = $("<span>", { class: 'state low', text: "LOW" }),
          $ss = $("<span>", { class: 'state high', text: "HIGH" });
        if (tclass) $cb.addClass(tclass);
        $cl.append($cb).append($sl);
        $linediv.append($sp).append($cl).append($ss);
      }
      else if (type == 'bool') {
        const $cl = $("<label>", { class: 'bool' }),
          $cb = $('<input>', { type: 'checkbox', checked: val == 'true', value: 'true' }).bind('change', handleBoolField),
          $sl = $("<div>", { class: 'slider round' });
        if (tclass) $cb.addClass(tclass);
        $cl.append($cb).append($sl).appendTo($linediv);
      }
      else if (item.options) {
        // Fix loose JSON so it can be parsed
        var opts = ConfigSchema.cleanOptions(item.options);

        const $select = $("<select>", { name });
        let options; eval(`options = ${opts}`);
        if (options instanceof Array) {
          for (const opt of options) {
            // If the opt is a single char, not a number, then wrap in single ' quotes
            const optval = /^\D$/.test(opt.toString()) ? `'${opt}'` : opt;
            $select.append($("<option>", { value: optval }).text(opt));
          }
        }
        else {
          for (const [opt, label] of Object.entries(options))
            $select.append($("<option>", { value: opt }).text(label));
        }
        $select.val(val).bind('change', handleSelectField);
        if (tclass) $select.addClass(tclass);
        $linediv.append($select);
      }
      else {
        const $input = $("<input>", { type: "text", name: name, value: val }).bind("change keyup", handleEditField);
        if (tclass) $input.addClass(tclass);
        $linediv.append($input);
      }
    }

    // An item's comment or its heading comment
    if (item.comment) {
      const $cspan = $("<span>").text(item.comment);
      $cspan.html($cspan.html().replace(/(https?:[^\s]+[\w])/g, '<a href="$1" target="_blank">$1</a>'));
      const $cdiv = $("<div>", { class: "comment" }).append($cspan);
      const comlist = item.comment.split('\n'),
            longest = comlist.reduce((a, b) => (a.length > b.length ? a : b));
      // Best guess for a heading comment
      if (item.notes || comlist.length > 3 || (comlist.length > 1 && longest.length > 60)) {
        $linediv.prepend($cdiv.addClass("descript"));
      }
      else {
        if (isswitch) $cdiv.addClass("switch");
        $linediv.append($cdiv);
      }
    }

    // An EOL comment for a setting, after a header comment
    if (item.notes) {
      const $cspan = $("<span>").text(item.notes);
      $cspan.html($cspan.html().replace(/(https?:[^\s]+[\w])/g, '<a href="$1" target="_blank">$1</a>'));
      const $cdiv = $("<div>", { class: "comment" }).append($cspan);
      if (isswitch) $cdiv.addClass("switch");
      $linediv.append($cdiv);
    }

    // Keep mutual references between item info and its .line div.
    $inner.append($linediv);
    //log(`Added item ${name} to the form.`);
  }

  /**
   * @brief Save the collapsed state of a section.
   * @description Save the collapsed state of a section to the config_filter.
   * @param {string} sect_class - The class
   * @param {bool} hide - Whether to hide the section.
   */
  function saveSectionCollapsed(sect_class, hide) {
    log("saveSectionCollapsed", {sect_class, hide});

    if (!('collapsed' in config_filter)) config_filter.collapsed = [];

    if (sect_class == 'all') {
      config_filter.collapsed = [];
      if (hide)
        for (let sect in schema.data)
          config_filter.collapsed.push(sect);
    }
    else
      config_filter.collapsed.toggle(sect_class, hide);

    saveWebViewState();
  }

  /**
   * @brief Recreate the form from the structured data.
   * This is called to refresh the form once structured data is ready.
   */
  function buildConfigForm() {
    const data = schema.data;
    // Bind click event to the revealer
    const do_collapse = (e, sectid) => {
      // Check if the alt/option key is pressed
      const fs = `fieldset.section.${sectid}`,
            ns = !$(fs).hasClass('collapsed'),
            $fs = $(e.altKey ? "fieldset" : fs);
      $fs.toggleClass('collapsed', ns);
      saveSectionCollapsed(e.altKey ? 'all' : sectid, ns);
    };

    // Iterate over the config data and create a form
    const $form = $('<form>');
    for (let [sect, dict] of Object.entries(data)) {
      if (sect == '_') continue;
      const sectid = sect.sectID();
      const collapsed = config_filter.collapsed.includes(sectid) ? ' collapsed' : '';
      log(`${sect} =====================`);
      // Create a form group for each section
      const title = `${ConfigSchema.sectionEmoji(sect)}&nbsp;&nbsp;${sect.toLabel()}`,
        $fieldset = $(`<fieldset class="section ${sectid}${collapsed}">`),
        $revealer = $(`<legend><span class="section-title">${title}</span></legend>`),
           $inner = $(`<div class="section-inner">`);

      $revealer.click((e) => { do_collapse(e, sectid); }); // Bind click event to the revealer

      // Emit all the option lines for this section.
      // Gathered items with the same name will appear at the same
      // line in the form, with only one visible at a time due to requires.
      for (let [name, foo] of Object.entries(dict)) {
        if (Array.isArray(foo))
          foo.forEach(item => addOptionLine(item, $inner));
        else
          addOptionLine(foo, $inner);
      }
      $fieldset.append($revealer).append($inner);
      $form.append($fieldset);
      log(`Added section ${sect} to the form`);
    }

    showComments(config_filter.show_comments, $form);
    showDisabled(config_filter.show_disabled, $form);
    applyFilter($filter.val(), $form);

    $formdiv.html('').append($form);
  }

  /**
   * @brief Create a new schema from document text then build a new form.
   * @description This may be called when the Custom Editor is first loaded, or
   *              when the app detects an external change in the current config file.
   * @param {string} text - The text of the document.
   */
  function buildConfigFormWithText(text) {
    log("buildConfigFormWithText");
    // Create a whole new schema and yeet the old one.
    schema = ConfigSchema.newSchemaFromText(text);
    //schema.debug_sections();
    //schema.debug();

    saveWebViewState();
    buildConfigForm();
  }

  /**
   * @brief Use the given schema data index to rebuild the form.
   * @description This is called when the Custom Editor is first loaded,
   *              and when the app detects an external change in the file.
   * @param {string} text - The text of the document.
   */
  function buildConfigFormWithData(data) {
    log("buildConfigFormWithData", data);
    schema.data = data;
    saveWebViewState();
    buildConfigForm();
  }

  /**
   * @brief Handle messages sent from the extension to the webview
   * @description Handle 'message' events broadcast to the window.
   *              update(text) : Rebuild the form with the provided text.
   *              filter(terms) : Store the filter terms in the filter field.
   *              error(text) : Show an error message.
   * @param {object} message - The message object.
   */
  function handleMessageToUI(message) {
    log("editview.js:handleMessageToUI", message);
    switch (message.type) {
      // Update the whole form in response to an external change.
      case 'update':
        if (ignore_update)  // This view caused the update? Ignore it.
          ignore_update = false;
        else
          buildConfigFormWithData(message.schema);  // Use the provided data to rebuild the form.
        break;

      case 'text-update':
        if (ignore_update)  // This view caused the update? Ignore it.
          ignore_update = false;
        else
          buildConfigFormWithText(message.text);  // Use the provided text to rebuild the form.
        break;

      // Display an error message
      case 'error':
        $('#error').text(message.text).show().click(() => { $('#error').hide(); });
        break;
    }
  }
  window.addEventListener('message', (e) => { handleMessageToUI(e.data); });

  //
  // File Loaded / Tab Revealed
  //
  // Webviews are normally torn down when not visible (including when the user
  // switches to another tab) and re-created when they become visible again.
  //

  // Add handlers to the filter form, comment checkbox, etc.
  initConfigForm();

  // If there is state data then the tab is being re-shown
  // we can just build the form using the saved data.
  const state = vscode.getState();
  if (state) {
    log("Got VSCode state", state);
    initFilter(state.filter);
    schema = ConfigSchema.newSchemaFromData(state.data);
    buildConfigForm();
  }

});
