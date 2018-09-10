define([
  'jquery',
  window.location.origin + '/widgets/amo__vox__implant/call_result.js'
], function ($, CallResult) {

  var CallResultFail = CallResult.extend({
    initialize: function (params) {
      var _this = this;

      this.widget = params.widget;
      this.lang = this.widget.i18n('result_form');

      this.set_element(params.element);

      this.user = AMOCRM.constant('user');
      this.call_info = params.call_info;
      this.call_record = params.call_record;
      this.call_time = params.call_time / 1000;
      this.call_time = parseInt(this.call_time);
      this.result = {
        el: {}
      };
      this.linkSuggestElement(this.element);
      this.destroy();
    },
    destroy: function () {
      var _this = this,
        CallsList = this.widget.__CallsList;

      if (CallsList._list_current_call) {
        CallsList.calls.push(CallsList._list_current_call);
        CallsList.$el.find('#call_element_' + CallsList._list_current_call.cid).remove();
        CallsList.bindViews(CallsList._list_current_call, false);
      }
      CallsList.startSort();
      if (this.call_record) {
        delete this.call_record.url;
      }
      this.saveCall({
        success: function () {
          _this.reloadPage();
        },
        always: function () {
          CallsList.callEnded();
          CallsList.checkListState();//делаем следующий шаг
        }
      });
    }
  });
  return CallResultFail;
});