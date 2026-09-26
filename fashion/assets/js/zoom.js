// swiper product details
if ($(".product-thumbs-slider").length > 0) {

    const $wrap = $(".product-thumbs-slider");

    const enableColorFilter =
        $wrap.closest(".section-product-single")
            .hasClass("enable-filter-color-slider");

    const $mainEl = $wrap.find(".tf-product-media-main");
    const $thumbEl = $wrap.find(".tf-product-media-thumbs");
    const $section = $wrap.closest(".section-product-single");

    var direction = $thumbEl.data("direction") ?? "horizontal";
    var preview = $thumbEl.data("preview");
    var xl_preview = $thumbEl.data("xl-preview") ?? preview;
    var space = $thumbEl.data("space") || 8;

    const allMainSlides = $mainEl.find(".swiper-slide").clone();
    const allThumbSlides = $thumbEl.find(".swiper-slide").clone();

    // =========================
    // THUMBS
    // =========================

    var thumbs = new Swiper($thumbEl[0], {
        spaceBetween: space,
        slidesPerView: preview,
        freeMode: true,
        watchSlidesProgress: true,
        observer: true,
        observeParents: true,

        breakpoints: {
            0: {
                direction: "horizontal",
                slidesPerView: 4,
            },
            575: {
                direction: "horizontal",
                slidesPerView: 5,
            },
            1200: {
                direction: direction,
                slidesPerView: xl_preview,
            },
        },
    });

    // =========================
    // MAIN
    // =========================

    window.mainSwiper = new Swiper($mainEl[0], {
        spaceBetween: 5,
        observer: true,
        observeParents: true,
        speed: 800,

        navigation: {
            nextEl: $wrap.find(".thumbs-next")[0],
            prevEl: $wrap.find(".thumbs-prev")[0],
        },

        thumbs: {
            swiper: thumbs,
        },
    });

    // =========================
    // FILTER COLOR
    // =========================

    function filterSlidesByColor(color) {

        if (!enableColorFilter) return;

        window.mainSwiper.removeAllSlides();
        thumbs.removeAllSlides();

        let mainSlides = [];
        let thumbSlides = [];

        allMainSlides.each(function (i) {

            const slideColor = $(this).data("color");

            if (slideColor === color) {

                mainSlides.push($(this)[0].outerHTML);

                if (allThumbSlides.eq(i).length) {
                    thumbSlides.push(allThumbSlides.eq(i)[0].outerHTML);
                }
            }
        });

        window.mainSwiper.appendSlide(mainSlides);
        thumbs.appendSlide(thumbSlides);

        window.mainSwiper.update();
        thumbs.update();

        window.mainSwiper.slideTo(0, 0);
        thumbs.slideTo(0, 0);
    }

    // =========================
    // HELPERS
    // =========================

    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    function updateActiveButtonThumbs(type, activeIndex) {

        var btnClass = `.${type}-btn`;
        var dataAttr = `data-${type}`;

        var currentClass =
            `.tf-product-info-list .value-current${capitalizeFirstLetter(type)}`;

        var selectClass =
            `.tf-product-info-list .select-current${capitalizeFirstLetter(type)}`;

        $section.find(btnClass).removeClass("active");

        var currentSlide =
            $(window.mainSwiper.slides[activeIndex]);

        var currentValue = currentSlide.attr(dataAttr);

        if (currentValue) {

            $section.find(`${btnClass}[${dataAttr}='${currentValue}']`)
                .addClass("active");

            $section.find(currentClass).text(currentValue);

            $section.find(selectClass).text(currentValue);
        }
    }

    function scrollToThumbs(type, value, color) {

        if (!value || !color) return;

        var targetIndex = -1;

        $(window.mainSwiper.slides).each(function (index) {

            if (
                $(this).attr(`data-${type}`) === value &&
                $(this).attr("data-color") === color
            ) {
                targetIndex = index;
                return false;
            }
        });

        if (targetIndex >= 0) {

            window.mainSwiper.slideTo(targetIndex, 1000, false);

            thumbs.slideTo(targetIndex, 1000, false);
        }
    }

    // =========================
    // BUTTON EVENTS
    // =========================

    function setupVariantButtonsThumbs(type) {

        $section.find(`.${type}-btn`)
            .off("click")
            .on("click", function () {

                if ($(this).closest(".modal-quick-view").length) return;

                var value = $(this).data(type);

                // =====================
                // COLOR
                // =====================

                if (type === "color") {

                    $section.find(".color-btn").removeClass("active");

                    $(this).addClass("active");

                    $section.find(".value-currentColor").text(value);

                    if (enableColorFilter) {

                        filterSlidesByColor(value);

                    } else {

                        scrollToThumbs(type, value, value);
                    }

                    return;
                }

                // =====================
                // SIZE
                // =====================

                var color =
                    $section.find(".value-currentColor").text().trim();

                $section.find(`.${type}-btn`).removeClass("active");

                $(this).addClass("active");

                scrollToThumbs(type, value, color);
            });
    }

    // =========================
    // EVENTS
    // =========================

    ["color", "size"].forEach((type) => {

        window.mainSwiper.on("slideChange", function () {

            updateActiveButtonThumbs(type, this.activeIndex);
        });

        setupVariantButtonsThumbs(type);

        updateActiveButtonThumbs(type, window.mainSwiper.activeIndex);
    });

    // =========================
    // INIT FIRST ACTIVE COLOR
    // =========================

    if (enableColorFilter) {

        const firstActiveColor =
            $section.find(".color-btn.active").data("color");

        if (firstActiveColor) {
            filterSlidesByColor(firstActiveColor);
        }
    }
}

(function ($) {
    "use strict";

    var section_zoom = function () {
        $(".tf-image-zoom").on("mouseover", function () {
            $(this).closest(".section-image-zoom").addClass("zoom-active");
        });
        $(".tf-image-zoom").on("mouseleave", function () {
            $(this).closest(".section-image-zoom").removeClass("zoom-active");
        });
    };
    var cusZoom = function () {
        var image_zoom = function () {
            var driftAll = document.querySelectorAll(".tf-image-zoom");
            var pane = document.querySelector(".tf-zoom-main");

            if (matchMedia("only screen and (min-width: 1200px)").matches) {
                $(driftAll).each(function (i, el) {
                    if (!el._drift) {
                        el._drift = new Drift(el, {
                            zoomFactor: 2,
                            paneContainer: pane,
                            inlinePane: false,
                            handleTouch: false,
                            hoverBoundingBox: true,
                            containInline: true,
                        });
                    }
                });
            } else {
                $(driftAll).each(function (i, el) {
                    if (el._drift) {
                        el._drift.destroy();
                        el._drift = null;
                    }
                });
            }

            if (typeof $.fn.magnificPopup !== "undefined") {
                $(driftAll).magnificPopup({
                    type: "image",
                    gallery: {
                        enabled: true,
                    },
                    zoom: {
                        enabled: true,
                    },
                });
            }
        };

        window.addEventListener("resize", image_zoom);
        image_zoom();
    };

    var imageZoomMagnifier = function () {
        var driftAll = document.querySelectorAll(".tf-image-zoom-magnifier");
        $(driftAll).each(function (i, el) {
            new Drift(el, {
                zoomFactor: 2,
                inlinePane: true,
                containInline: false,
            });
        });
    };

    var imageZoomInner = function () {
        var driftAll = document.querySelectorAll(".tf-image-zoom-inner");
        var pane = document.querySelector(".tf-product-zoom-inner");
        $(driftAll).each(function (i, el) {
            new Drift(el, {
                paneContainer: pane,
                zoomFactor: 2,
                inlinePane: false,
                containInline: false,
            });
        });
    };

    var lightBoxSwiper = function () {
        const lightbox = new PhotoSwipeLightbox({
            gallery: "#gallery-swiper-started",
            children: "a",
            pswpModule: PhotoSwipe,
            bgOpacity: 1,
            secondaryZoomLevel: 2,
            maxZoomLevel: 3,
        });

        lightbox.init();

        lightbox.on("change", () => {
            const { pswp } = lightbox;

            if (window.mainSwiper) {
                window.mainSwiper.slideTo(pswp.currIndex, 0, false);
            }
        });

        lightbox.on("afterInit", () => {

            if (
                window.mainSwiper &&
                window.mainSwiper.params?.autoplay?.enabled
            ) {
                window.mainSwiper.autoplay.stop();
            }
        });

        lightbox.on("closingAnimationStart", () => {
            const { pswp } = lightbox;

            if (window.mainSwiper) {

                window.mainSwiper.slideTo(pswp.currIndex, 0, false);

                if (window.mainSwiper.params?.autoplay?.enabled) {
                    window.mainSwiper.autoplay.start();
                }
            }
        });
    };

    var lightBox = function () {
        const lightbox = new PhotoSwipeLightbox({
            gallery: "#gallery-started",
            children: "a",
            pswpModule: PhotoSwipe,
            bgOpacity: 1,
            secondaryZoomLevel: 2,
            maxZoomLevel: 3,
        });
        lightbox.init();
    };

    var modelViewer = function () {
        if ($(".tf-model-viewer").length) {
            $(".tf-model-viewer-ui-button").on("click", function (e) {
                $(this).closest(".tf-model-viewer").find("model-viewer").removeClass("disabled");
                $(this).closest(".tf-model-viewer").toggleClass("active");
            });

            $(".tf-model-viewer-ui").on("dblclick", function (e) {
                const modelViewer = $(this).closest(".tf-model-viewer").find("model-viewer")[0];

                $(this).closest(".tf-model-viewer").find("model-viewer").addClass("disabled");
                $(this).closest(".tf-model-viewer").toggleClass("active");

                if (modelViewer) {
                    modelViewer.cameraOrbit = "0deg 90deg auto";
                    // modelViewer.fieldOfView = "45deg"; 
                    modelViewer.updateFraming();
                }
            });
        }
    };

    // Dom Ready
    $(function () {
        section_zoom();
        cusZoom();
        imageZoomMagnifier();
        imageZoomInner();
        lightBoxSwiper();
        lightBox();
        modelViewer();
    });
})(jQuery);
