// Echo embed widget. Drop into any page:
//   <div id="echo-form" data-form-id="0x…"></div>
//   <script src="https://echo-20u.pages.dev/embed.js" defer></script>
// The script renders an iframe pointing at the form viewer.
(function () {
  "use strict";
  var ECHO_ORIGIN = "https://echo-20u.pages.dev";
  function mount(target) {
    var formId = target.getAttribute("data-form-id");
    if (!formId || !/^0x[0-9a-f]+$/i.test(formId)) {
      target.textContent = "[Echo embed: missing or invalid data-form-id]";
      return;
    }
    var height = target.getAttribute("data-height") || "640";
    var iframe = document.createElement("iframe");
    iframe.src = ECHO_ORIGIN + "/forms/" + formId;
    iframe.style.cssText =
      "width:100%;border:0;border-radius:8px;min-height:" + height + "px;";
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("title", "Echo feedback form");
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-forms allow-same-origin allow-popups",
    );
    target.replaceChildren(iframe);
  }
  function init() {
    var nodes = document.querySelectorAll("[data-form-id]");
    nodes.forEach(mount);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
