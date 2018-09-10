define(['jquery'], function ($) {

  var Call = {
    View: Backbone.View.extend({
      tagName: 'div',
      className: 'amo__vox__implant_call__list_wrapper__list__task',
      initialize: function (options) {
        var _this = this;

        this.widget = options.widget;
        this.$el.attr('id', 'call_element_' + options.model.cid);
        this.model = options.model;
        this.listenTo(this.model, "destroy", function () {
//                    _this.remove();
        });
        this.listenTo(this.model, "remove", function () {
          console.log('listelem view remove');
          this.$el.remove();
        });
        var attributes = this.model.toJSON();

        console.log(attributes);
        _this.widget.getTemplate(
          'call_list_element',
          {},
          function (template, base_params) {
            _this.$el.html(template.render(_.extend(base_params, attributes)));
          }
        )
      }
    })
  };

  return Call;
});