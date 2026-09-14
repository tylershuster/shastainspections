/* Shasta Home Inspections — shared behaviour */
(function () {
  "use strict";

  /* --- Mobile navigation ------------------------------------------------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("primary-nav");

  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      if (open) {
        nav.setAttribute("data-open", "true");
      } else {
        nav.removeAttribute("data-open");
      }
    };

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    document.addEventListener("click", function (e) {
      if (
        toggle.getAttribute("aria-expanded") === "true" &&
        !nav.contains(e.target) &&
        !toggle.contains(e.target)
      ) {
        setOpen(false);
      }
    });

    // Reset when leaving the mobile breakpoint so the menu can't stay stuck open.
    var mq = window.matchMedia("(min-width: 861px)");
    var onChange = function (e) { if (e.matches) setOpen(false); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* --- Header shadow once scrolled --------------------------------------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px;";
    document.body.prepend(sentinel);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        header.setAttribute("data-stuck", String(!entries[0].isIntersecting));
      }).observe(sentinel);
    }
  }

  /* --- Reveal on scroll --------------------------------------------------- */
  var reveals = document.querySelectorAll(".reveal");
  if (reveals.length) {
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || !("IntersectionObserver" in window)) {
      reveals.forEach(function (el) { el.setAttribute("data-visible", "true"); });
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.setAttribute("data-visible", "true");
              io.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
      );
      reveals.forEach(function (el) { io.observe(el); });
    }
  }

  /* --- Contact form ------------------------------------------------------- */
  var form = document.getElementById("contact-form");
  if (form) {
    var status = document.getElementById("form-status");
    var button = form.querySelector('button[type="submit"]');
    var buttonLabel = button ? button.textContent : "";

    var showError = function (field, message) {
      var box = document.getElementById(field.id + "-error");
      if (box) box.textContent = message || "";
      field.setAttribute("aria-invalid", message ? "true" : "false");
    };

    var clearErrors = function () {
      form.querySelectorAll("input, textarea").forEach(function (f) { showError(f, ""); });
    };

    var setStatus = function (message, state) {
      if (!status) return;
      status.textContent = message || "";
      if (state) status.setAttribute("data-state", state);
      else status.removeAttribute("data-state");
    };

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors();
      setStatus("", null);

      var data = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        message: form.elements.message.value.trim(),
        // Honeypot: real people leave this empty.
        company: form.elements.company ? form.elements.company.value : ""
      };

      var firstBad = null;
      if (!data.name) { showError(form.elements.name, "Please enter your name."); firstBad = firstBad || form.elements.name; }
      if (!data.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) {
        showError(form.elements.email, "Please enter a valid email address.");
        firstBad = firstBad || form.elements.email;
      }
      if (!data.message) { showError(form.elements.message, "Please enter a message."); firstBad = firstBad || form.elements.message; }
      if (firstBad) { firstBad.focus(); return; }

      if (button) { button.setAttribute("aria-busy", "true"); button.textContent = "Sending…"; }

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (res) {
          return res.json().then(function (body) { return { ok: res.ok, body: body }; });
        })
        .then(function (result) {
          if (!result.ok) throw new Error((result.body && result.body.error) || "Something went wrong.");
          form.reset();
          setStatus(
            "Thanks — your message is on its way. Riley will get back to you shortly. " +
            "If it's urgent, call (530) 945-6292.",
            "ok"
          );
          if (status) { status.focus(); }
        })
        .catch(function (err) {
          setStatus(
            (err && err.message ? err.message : "Something went wrong.") +
            " You can also email riley@shastainspections.com or call (530) 945-6292.",
            "error"
          );
        })
        .finally(function () {
          if (button) { button.removeAttribute("aria-busy"); button.textContent = buttonLabel; }
        });
    });
  }
})();
