/**
 * Auto Build Marlin
 * abm/js/docsview.js
 *
 * This script runs when the view is created / revealed.
 *
 * The webview already contains the base HTML, so we:
 *  - Set up the initial docs webview.
 */
'use strict';

// Useful string method
String.prototype.toTitleCase = function () {
  return this.replace(/\b([A-Z])(\w+)\b/gi, (_,p1,p2) => { return p1.toUpperCase() + p2.toLowerCase(); });
}

var verbose = false;
function log(message, data) {
  if (!verbose) return;
  console.log(`[docsview] ${message}`);
  if (data !== undefined) console.dir(data);
}

// Save the current view state.
// Use this to restore the view when it is revealed.
var docs_filter = "";
function saveWebViewState() {
  const data = { filter: docs_filter };
  log('saveWebViewState', data);
  vscode.setState(data);
}

//
// Declare a marlinfwSearch singleton
//
var marlinfwSearch = (() => {

  var qmatch,
    $searchForm, $searchInput,
    $resultTemplate, $resultsContainer,
    $foundContainer, $foundTerm, $foundCount,
    self, searchTimer, odd = false,
    section_head = { gcode:"G-code", basics:"Getting Started", config:"Configuration", feat:"Features", devel:"Developer Guide", setting:"Settings" };

  const ignore_pattern = /\b(a(ll|nd|re(n't)?)|but|can('t|not)?|d(id|oes)(n't)?|end|for|ha(d|s|ve)(n't)?|it'?s|odd|use[ds]?|even|from|man?y|more|much|some|this|tha[nt]|th[eo]se|the([mny]|ir|re|y're)?|(was|were)(n't)?|wh(at|en|ere|ich|o|y)|will|won't|other|people|(al)?though|users|your?|one|two)\b/g;

  // Return the public interface
  return {

    /**
     * Inject content into template using placeholder
     * @param {String} originalContent
     * @param {String} injection
     * @param {String} placeholder
     * @return {String} injected content
     */
    injectContent: (originalContent, injection, placeholder) => {
      if (injection === undefined) injection = '';
      var regex = new RegExp(placeholder, 'g');
      return originalContent.replace(regex, injection);
    },

    init: function() {
      self = this;  // The enclosing function()

      // Extend String to remove accents from characters
      String.prototype.unaccent = function() { return this.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

      $searchForm = $("[data-search-form]");
      $searchInput = $("[data-search-input]");
      $resultTemplate = $("#search-result");
      $resultsContainer = $("[data-search-results]");
      $foundContainer = $("[data-search-found]");
      $foundTerm = $("[data-search-found-term]");
      $foundCount = $("[data-search-found-count]");

      // hide items found string
      $foundContainer.hide();

      $searchForm.on('submit',function(e){ return false; });

      // Get search results on submission of form
      // TODO: Update results on change, after a pause
      $searchInput.change(self.onSearchChanged)
                  .on('input cut paste', () => { setTimeout(self.searchFromField, 50) })
                  .keydown((e) => {
                    var k = e.keyCode;
                    if (k == 10 || k == 13) return self.onSearchChanged(e);
                  })
                  .keyup((e) => {
                    var k = e.keyCode;
                    if (k >= 32 || k == 8) self.onSearchKeyUp();
                  })

      // Focus the search field, and also select all chars
      $searchInput.focus().select();
    },

    // Get the trimmed string from the search field
    searchFieldString: () => {
      return $searchInput.val().trim();
    },

    // Set the search field value
    setFilter: (val) => {
      $searchInput.val(val).select().focus();
      self.searchFromField();
    },

    // Convert a string to a regex pattern
    searchPattern: (str) => {
      const patt = str.toLowerCase().replace(ignore_pattern, '').trim().replace(/\s+/gm, '.+').replace(/([([\\])/gm, '\\$1');
      return new RegExp(patt);
    },

    // Execute a search using the field value
    searchText: (intext) => {
      var newq = intext.unaccent(),
          newm = self.searchPattern(newq);
      self.execSearch(newq, newm);
    },

    // Execute a search using the field value
    searchFromField: () => {
      self.searchText(self.searchFieldString());
    },

    // When the field value changes (as on blur, paste) execute a search right away.
    onSearchChanged: (e, allow=false) => {
      if (!allow) e.preventDefault();
      const newq = self.searchFieldString();
      if (newq.length == 0 || newq.length >= 3 || newq.match(/^[gmd]\d+/i))
        self.searchFromField();
      return allow;
    },

    // After a keypress set a timer to run a search on the field value,
    // canceling any previous timer.
    onSearchKeyUp: () => {
      if (searchTimer) { clearTimeout(searchTimer); searchTimer = 0; }
      const newq = self.searchFieldString();
      if (newq.length == 0 || newq.length >= 3 || newq.match(/^[gmd]\d+/i))
        searchTimer = setTimeout(self.searchFromField, 50);
    },

    /**
     * Execute search
     * @return null
     */
    execSearch: (newq, newm) => {
      if (newq == '') return;

      docs_filter = newq;
      saveWebViewState();
      qmatch = newm;

      let resultsCount = 0, results = '', prevclass = '';
      $.each(searchData, (index, item) => {
        // check if search term is in content or title
        const comp = (item.name + " " + item.title + ' ' + item.group + ' ' + item.content + item.excerpt).toLowerCase();
        if (comp.match(qmatch)) {
          if (item.class != prevclass) {
            prevclass = item.class;
            odd = false;
            let fancy = section_head[item.class];
            results += '<h2 class="' + item.class + '">' + (fancy ? fancy : item.class.toTitleCase()) + '</h2>';
          }
          results += self.populateResultContent($resultTemplate.html(), item);
          odd = !odd;
          resultsCount++;
        }
      });

      self.populateResultsString(resultsCount);
      self.showSearchResults(results);
    },

    /**
     * Add search results to placeholder
     * @param {String} results
     * @return null
     */
    showSearchResults: (results) => {
      // Add results HTML to placeholder
      $resultsContainer.html(results);

      // Get the height of .overlay and pad the top of the results
      $resultsContainer.css({paddingTop: $('.overlay').height() + 'px'});

      // Scroll back to top
      $(window).scrollTop(0);
    },

    /**
     * Add results content to item template
     * @param {String} html
     * @param {object} item
     * @return {String} Populated HTML
     */
    populateResultContent: (html, item) => {
      html = self.injectContent(html, item.title, '##Title##');
      html = self.injectContent(html, item.link, '##Url##');
      html = self.injectContent(html, item.excerpt, '##Excerpt##');
      var extra_tags = [];
      if (item.exp !== undefined)
        extra_tags.push('<span class="experimental">🧪</span>');
      if (item.requires !== undefined )
        $.each(item.requires.split(/\s*,\s*/), (i,v) => {
          extra_tags.push(' <span class="requires">🔧&nbsp;' + v + '</span>');
        });
      if (item.group !== undefined)
        extra_tags.push(' <span class="default">🏷️&nbsp;' + item.group + '</span>');
      if (item.since !== undefined)
        extra_tags.push(' <span class="since">✅&nbsp;' + item.since + '</span>');
      extra_tags = extra_tags.length ? `<div class="labels">${extra_tags.join(' ')}</div>` : '';
      html = self.injectContent(html, extra_tags, '##CustomHTML##');
      html = self.injectContent(html, 'item' + (odd ? ' odd' : '') + (item.last ? ' last' : '') + (item.class ? ` ${item.class}` : ''), '##DivClass##');
      return html;
    },

    /**
     * Populates results string
     * @param {String} count
     * @return null
     */
    populateResultsString: (count) => {
      $foundTerm.text(docs_filter);
      $foundCount.text(count);
      $foundContainer.show();
    }

  }; // return public interface

})();

$(function () {
  // Set up the view anew.
  function initDocsView() {
    // Fetch the marlinfw.org site index
    marlinfwSearch.init();
  }

  /**
   * @brief Handle messages sent from the provider with iview.postMessage(msg)
   * @description Handle 'message' events sent directly to the view.
   * @param {object} message - The message object.
   */
  function handleMessageToUI(m) {
    log("docsview.js : handleMessageToUI", m);
    switch (m.type) {
      // Update the whole form in response to an external change.
      //case 'say':
      //  showtext(m.text);
      //  break;

      // Display an error message
      case 'error':
        $('#error').text(m.text).show().click(() => { $('#error').hide(); });
        break;
    }
  }
  window.addEventListener('message', (e) => { handleMessageToUI(e.data); });

  //
  // View was revealed.
  //
  // Webviews are normally torn down when not visible and
  // re-created when they become visible again.
  //

  // Create elements, add handlers, fill in initial info, etc.
  initDocsView();

  //
  // Docs Panel Revealed
  //
  // If there is state data then apply it to the view, e.g., to preserve the filter text.
  const state = vscode.getState();
  if (state) {
    log("Got VSCode state", state);
    if ('filter' in state) {
      log("Init Marlin Docs Webview with stored data")
      marlinfwSearch.setFilter(state.filter);
    }
  }

});
