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
    return this.replace(/(\w)jerk/gi, '$1 jerk')
               .replace(/([A-Z])(\w+)/gi, (m, p1, p2) => { return p1.toUpperCase() + p2.toLowerCase(); })
               .replace(/(xyuv|\b[XYZ]{2,3}|[XYZ]{2,3}\b|g?lcd|yhcb|\b(blt|mpc|sd)|\b(adc|bd|btt|cnc|jd|la|lk|led|lin|mpe?|psu|ptc|ubl|usb|utf)\b|dgus|dwin|eeprom|ftdi|gfx|mks|pid|pwm|ssd|tft|wyh|(dlp|mmu)\b|rgbw?|oled|pca\d+|uuid|HD44\d+|(sd|hw|sw|ui)\b|(sc|tp)ara|\bSPI\b|cr\d+|\b[a-z]+\d+[a-z]*\b)/gi, (m, p1) => { return p1.toUpperCase(); })
               .replace(/\bMm M\b/, 'mm/min').replace(/\b0 0\b/, '0,0').replace('Gcode', 'G-code')
               .replace(/(\b(at|mm|ms|in|of|us)\b)/gi, (m, p1) => { return p1.toLowerCase(); })
               .replace(/\bus\b/gi, 'µs');
  }
  String.prototype.unbrace     = function () { return this.replace(/[\[\]]/g, ''); }
  String.prototype.toLabel     = function () { return this.unbrace().replace(/_/g, ' ').toTitleCase(); }
  String.prototype.toID        = function () { return this.unbrace().replace(/_/g, '-').toLowerCase(); }
  String.prototype.sectID      = function () { return this.replace(/[^\w]+/g, '-').toLowerCase(); }
  String.prototype.camelToID   = function () { return this.unbrace().replace(/([a-z])([A-Z0-9_])/g, '$1_$2').replace(/_/g, '-').toLowerCase(); }

  var verbose = false;
  function log(message, data) {
    if (!verbose) return;
    console.log(`[editview] ${message}`);
    if (data !== undefined) console.dir(data);
  }

  var schema = ConfigSchema.newSchema(),
      config_filter = { terms:'', show: true },
      result_index = 0;

  // We need getState, setState, and postMessage.
  const vscode = acquireVsCodeApi();

  // Ignore the next update message.
  var ignore_update = false

  // Collect changes and post the collection
  var multi_update = false, changes = [];
  function start_multi_update() {
    multi_update = true;
    changes = [];
  }
  function end_multi_update() {
    vscode.postMessage({ type:'multi-change', changes });
    multi_update = false;
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
    var $shower = $('#show-comments');
    $shower.bind('change', (e) => { applyShowComments($(e.target).is(':checked')); });

    // A button to test sending messages to the extension.
    const $button = $('#hello-button');
    $button.find('button').bind('click', () => {
      vscode.postMessage({ type: 'hello' });
    })
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
    $('#config-form div.line').each((i, div) => {
      const data = div.inforef;
      $(div).toggleClass('nope', data.evaled !== undefined && !data.evaled);
    });
    hideEmptySections(true);
  }

  /**
   * @brief Update an option, persistent state, and document.
   * @description Update an option, save the full state, send the change to the document.
   * @param {dict} optref - The option to update.
   * @param {dict} fields - The fields to replace in the option.
   */
  function commitChange(optref, fields) {
    fields.dirty = true;
    if (optref.dirty === undefined || optref.dirty == false) {
      optref.orig = { value: optref.value, enabled: optref.enabled };
    }
    else if ( (fields.value === undefined || optref.orig.value == fields.value)
      && (fields.enabled === undefined || optref.orig.enabled == fields.enabled)
    ) {
      fields.dirty = false;
      delete optref.orig;
    }
    log(`Setting Dirty flag: ${fields.dirty}`);
    $(`div.line.sid-${optref.sid}`).toggleClass('dirty', fields.dirty);

    Object.assign(optref, fields);
    log("Updated Option:", optref);
    schema.refreshRequiresAfter(optref.sid);
    refreshVisibleItems();
    saveWebViewState();
    ignore_update = true;
    const msg = { type: 'change', data: optref };
    if (multi_update)
      changes.push(msg);
    else
      vscode.postMessage(msg);
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
        enabled = $cb.is(':checked');   // State based on the checkbox.

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
    console.log("handleCheckbox", e);
    applyEnableCheckbox($(e.target));
  }

  //! @brief Handle a checkbox d$ event in a mutual-exclusive group.
  function handleCheckboxGroup(e) {
    const $cb = $(e.target), // The checkbox.
         $divs = $cb.closest('div.section-inner');
    console.log("Group div", $divs[0]);
    start_multi_update();
    $divs.find('div.d0 .radio:checked').each(
      function() {
        if (this === e.target) return;
        console.log("CB checked", this);
        //$acb.trigger('click');
        const $acb = $(this);
        $acb.prop('checked', false);
        applyEnableCheckbox($acb);
      }
    );

    applyEnableCheckbox($cb);
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
  function hideEmptySections(hasterms, $target=$formdiv) {
    $('#zero-box').removeClass('show');
    const $sects = $target.find('fieldset.section');
    $sects.addClass('hide');    // Hide all sections by default

    // Count up visible items in each section. Hide empty sections.
    let count = 0;
    for (const sect of $sects) {
      // Select all div.line without class 'hide'
      const $lines = $(sect).find('div.line:not(.hide):not(.nope)'), len = $lines.length;
      if (len > 0) {
        $(sect).removeClass('hide');
        count += len;
      }
    }

    if (count > 0)
      $('#filter-count').text(`${count ? count : 'No'} Setting${count != 1 ? 's' : ''}${hasterms ? ' Found' : ''}`);

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

  /**
   * Apply the comment checkbox filter by hiding/showing comments.
   */
   function showComments(show) {
    $formdiv.toggleClass('hide-comments', !show);
  }

  // Save the filter in the window. Unless flagged, also set the filter fields.
  function initFilterVal(filter, field=true) {
    config_filter = filter;
    $filter.val(filter.terms);
    $('#show-comments').prop('checked', filter.show);
    showComments(filter.show);
  }

  function applyShowComments(show) {
    config_filter.show = show;
    showComments(show);
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
  function addOptionLine(data, $inner) {
    // Add defaults for missing fields
    const defaults = { type: '', value: '', options: '', depth: 0, dirty: false, evaled: true },
              item = { ...defaults, ...data };

    // Get some option properties
    const name = item.name, ena = item.enabled, val = item.value,
            ts = item.type.split('['), type = ts[0],
        tclass = type + (ts.length > 1 ? '-arr' : ''),
      isswitch = type == 'switch',
       isradio = item.section[0] == '?' && item.depth == 0;

    log(`${name} = ${val}`);

    // Prepare the div, label, label text, and option enable checkbox / radio
    const $linediv = $("<div>", { id: `-${name.toID()}-${item.sid}`, class: `line sid-${item.sid}` }),
        $linelabel = $("<label>", { class: "opt" }),
        $labelspan = $("<span>").text(name.toLabel()),
           $linecb = $("<input>", { type: "checkbox", name, tabindex: 9999, checked: ena }).bind("change", isradio ? handleCheckboxGroup : handleCheckbox);

    if (isradio) $linecb.addClass('radio');
    $linediv[0].inforef = data;
    //if (item.depth)
    $linediv.addClass(`d${item.depth}`);
    if (item.dirty) $linediv.addClass('dirty');
    if (!item.evaled) $linediv.addClass('nope');
    if (!ena) $linediv.addClass("disabled");
    $linelabel.append($linecb).append($labelspan);
    $linediv.append($linelabel);
    if (!isswitch) {
      if (type == 'state') {
        const $cl = $("<label>", { class: 'bool' }),
          $cb = $('<input>', { type: 'checkbox', checked: val == 'true', value: 'true' }).bind('change', handleBoolField),
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
        var opts = item.options;
        if (/^[\{\[]((['"][^'"]*['"]|[^'"]+)\s*:)?\s*'/.test(opts))
          opts = opts.replace(/\"/g, "\\\"").replace(/'/g, '"');
        if (/^\[\s*("[^"]*"|[^"]+)\s*:/.test(opts))
          opts = opts.replace(/^\[/, "{").replace(/\]$/, "}");
        if (/^\{\s*(-?\d+)\s*:/.test(opts))
          opts = opts.replace(/(-?\d+)\s*:/g, '"$1":');

        const $select = $("<select>", { name }),
          options = JSON.parse(opts);
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
    log(`Added item ${name} to the form.`);
  }

  /**
   * @brief Recreate the form from the structured data.
   * This is called to refresh the form once structured data is ready.
   */
  function buildConfigForm() {
    const data = schema.data;
    // Bind click event to the revealer
    const do_reveal = (e, clas) => {
      // Check if the alt/option key is pressed
      const fs = `fieldset.${clas}`,
            ns = !$(fs).hasClass('collapsed'),
            $fs = $(e.altKey ? "fieldset" : fs);
      $fs.toggleClass('collapsed', ns);
    };

    // Iterate over the config data and create a form
    const $form = $('<form>');
    for (let [sect, dict] of Object.entries(data)) {
      if (sect == '_') continue;
      if (sect[0] == '?') sect = sect.slice(1);
      const sectid = sect.sectID();
      log(`${sect} =====================`);
      // Create a form group for each section
      const title = `${ConfigSchema.section_emoji(sect)}&nbsp;&nbsp;${sect.toLabel()}`,
        $fieldset = $(`<fieldset class="section ${sectid}">`),
        $revealer = $(`<legend><span class="section-title">${title}</span></legend>`),
           $inner = $(`<div class="section-inner">`);

      $revealer.find(".section-title").click((e) => { do_reveal(e, sectid); }); // Bind click event to the revealer

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

    applyFilter($filter.val(), $form);

    $formdiv.html('').append($form);
  }

  /**
   * @brief Create a new schema from document text then build a new form.
   * @description This is called when the Custom Editor is first loaded,
   *              and when the app detects an external change in the file.
   * @param {string} text - The text of the document.
   */
  function buildConfigFormWithText(text) {
    log("buildConfigFormWithText");
    // Create a whole new schema and yeet the old one.
    schema = ConfigSchema.fromText(text);
    //schema.debug_sections();
    //schema.debug();

    saveWebViewState();
    buildConfigForm();
  }

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
  function handleMessage(message) {
    log("handleMessage", message);
    switch (message.type) {
      // Update the whole form in response to an external change.
      case 'update':
        if (ignore_update)  // This view caused the update? Ignore it.
          ignore_update = false;
        else
          buildConfigFormWithData(message.schema);  // Use the provided data to rebuild the form.
          //buildConfigFormWithText(message.text);
        break;

      // Display an error message
      case 'error':
        $('#error').text(message.text).show().click(() => { $('#error').hide(); });
        break;
    }
  }
  window.addEventListener('message', (e) => { handleMessage(e.data); });

  //
  // File Loaded / Tab Revealed
  //
  // Webviews are normally torn down when not visible (including when the user
  // switches to another tab) and re-created when they become visible again.
  //

  // Add handlers to the filter form, comment checkbox, etc.
  initConfigForm();

  //
  // Tab Revealed
  //
  // If there is state data then we can skip the parser and build the form.
  const state = vscode.getState();
  if (state) {
    log("Got VSCode state", state);
    if (state.filter !== undefined) initFilterVal(state.filter);
    if (state.data !== undefined) {
      log("Init CE Webview with stored data")
      schema = ConfigSchema.fromData(state.data);
      buildConfigForm();
    }
  }

});
