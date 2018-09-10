define(['jquery', window.location.origin + '/frontend/js/vendor/storage.js'], function ($, srg) {

  var StorageMGMT = function (params) {
    this.widget = params.widget;
    this.change = params.change || function () {};
    this.bindEvents();
  };

  StorageMGMT.prototype.bindEvents = function () {
    $(window).on('storage', _.bind(function (e) {
      this.change(e);
    }, this));
  };

  return StorageMGMT;
});