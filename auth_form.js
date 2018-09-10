define(['jquery', 'lib/components/base/modal'], function ($, Modal) {

  var AuthForm = Backbone.View.extend({

    tagName: "div",
    id: 'vox_auth_form',
    initialize: function (params) {

      this.email = params.email;
      this.api_key = params.api_key;
      this.render();
    },

    render: function () {
      var data = '<iframe></iframe>',
        _this = this;
      new Modal({
        class_name: 'modal_vox',
        init: function ($modal_body) {
          $modal_body
            .html(data)
            .append('<span class="modal-body__close"><span class="icon icon-modal-close"></span></span>');
          $modal_body.find('iframe').attr(
            'src',
            /* https:// ссылка на авторизацию в вашей биллинговой системе, с передачей к примеру email'a и ключа API */
          ).load(function () {
              $modal_body
                .trigger('modal:loaded')
                .trigger('modal:centrify')
            });
        },
        destroy: function () {
        }
      });
    }
  });

  return AuthForm;
});