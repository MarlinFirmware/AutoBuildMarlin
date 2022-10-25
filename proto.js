/**
 * Auto Build Marlin
 * proto.js
 */

'use strict';

function init() {

  //
  // Extend String, Number, and Date with extras
  //
  String.prototype.lpad = function(len, chr) {
    if (!len) return this;
    if (chr === undefined) chr = ' ';
    var s = this+'', need = len - s.length;
    if (need > 0) s = new Array(need+1).join(chr) + s;
    return s;
  };

  String.prototype.rpad = function(len, chr) {
    if (!len) return this;
    if (chr === undefined) chr = ' ';
    var s = this+'', need = len - s.length;
    if (need > 0) s += new Array(need+1).join(chr);
    return s;
  };

  String.prototype.dequote = function()        { return this.replace(/^\s*"|"\s*$/g, '').replace(/\\/g, ''); };
  String.prototype.prePad = function(len, chr) { return len ? this.lpad(len, chr) : this; };
  String.prototype.zeroPad = function(len)     { return this.prePad(len, '0'); };
  String.prototype.toHTML = function()         { return jQuery('<div>').text(this).html(); };
  String.prototype.regEsc = function()         { return this.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&"); }
  String.prototype.lineCount = function(ind)   { var len = (ind === undefined ? this : this.substr(0,ind*1)).split(/\r?\n|\r/).length; return len > 0 ? len - 1 : 0; };
  String.prototype.lines = function()          { return this.split(/\r?\n|\r/); };
  String.prototype.line = function(num)        { var arr = this.split(/\r?\n|\r/); return num < arr.length ? arr[1*num] : ''; };
  String.prototype.replaceLine = function(num,txt) { var arr = this.split(/\r?\n|\r/); if (num < arr.length) { arr[num] = txt; return arr.join('\n'); } else return this; }
  String.prototype.toLabel = function()        { return this.replace(/[\[\]]/g, '').replace(/_/g, ' ').toTitleCase(); }
  String.prototype.toTitleCase = function()    { return this.replace(/([A-Z])(\w+)/gi, function(m,p1,p2) { return p1.toUpperCase() + p2.toLowerCase(); }); }
  Number.prototype.limit = function(m1, m2)  {
    if (m2 == null) return this > m1 ? m1 : this;
    return this < m1 ? m1 : this > m2 ? m2 : this;
  };
  Date.prototype.fileStamp = function(filename) {
    var fs = this.getFullYear()
      + ((this.getMonth()+1)+'').zeroPad(2)
      + (this.getDate()+'').zeroPad(2)
      + (this.getHours()+'').zeroPad(2)
      + (this.getMinutes()+'').zeroPad(2)
      + (this.getSeconds()+'').zeroPad(2);

    if (filename !== undefined)
      return filename.replace(/^(.+)(\.\w+)$/g, '$1-['+fs+']$2');

    return fs;
  }

} // init

init();
