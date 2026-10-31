import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

// Small building blocks shared by the pill and the popup.

export function vbox(params = {}) {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, ...params});
}

export function hbox(params = {}) {
    return new St.BoxLayout({orientation: Clutter.Orientation.HORIZONTAL, ...params});
}

// An actor goes from the width or height it had (from) to the one its new
// content or style asks for, then is left to its natural size again. No
// animation when from <= 0.
export function easeToNatural(actor, prop, from, duration = 200) {
    actor.remove_transition(prop);
    actor[prop] = -1;
    if (from <= 0)
        return;
    const [, to] = prop === 'width' ? actor.get_preferred_width(-1) : actor.get_preferred_height(actor.width);
    if (Math.abs(from - to) < 1)
        return;
    actor[prop] = from;
    actor.ease({[prop]: to, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onComplete: () => (actor[prop] = -1)});
}

export function label(text, styleClass, params = {}) {
    const l = new St.Label({text: text ?? '', style_class: styleClass ?? '', y_align: Clutter.ActorAlign.CENTER, ...params});
    l.clutter_text.ellipsize = 3; // Pango.EllipsizeMode.END
    return l;
}

// A button with an icon and/or a label.
export function button({icon, text, styleClass = '', accessibleName, onClick, iconSize}) {
    const box = hbox({style_class: 'nowpill-btn-box', x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER});
    if (icon) {
        box.add_child(new St.Icon({icon_name: icon, style_class: 'nowpill-btn-icon',
            ...(iconSize ? {icon_size: iconSize} : {})}));
    }
    if (text)
        box.add_child(label(text, 'nowpill-btn-label'));
    const b = new St.Button({
        style_class: `nowpill-btn ${styleClass}`,
        child: box,
        can_focus: true,
        accessible_name: accessibleName ?? text ?? '',
    });
    if (onClick)
        b.connect('clicked', () => onClick(b));
    return b;
}

// A thin bar: `set(fraction)` fills it, `-1` hides it. The fill spans the
// whole bar and is scaled from its left edge: changing it never touches the
// layout (resizing it from a size notification relayouts the top bar on
// every tick).
export class Bar {
    constructor(styleClass) {
        this.actor = new St.Widget({style_class: `nowpill-bar ${styleClass}`, x_expand: true,
            layout_manager: new Clutter.BinLayout()});
        this.fill = new St.Widget({style_class: 'nowpill-bar-fill', x_expand: true, y_expand: true,
            pivot_point: new Graphene.Point({x: 0, y: 0.5}), scale_x: 0});
        this.actor.add_child(this.fill);
        this._fraction = -1;
        this._color = null;
    }

    set(fraction, color, animate = false) {
        this.actor.visible = fraction >= 0;
        if (color !== this._color) {
            this._color = color;
            this.fill.style = color ? `background-color: ${color};` : null;
        }
        const f = Math.max(0, Math.min(1, fraction));
        if (f === this._fraction)
            return;
        // Small steps (a countdown's seconds) glide; jumps to another
        // activity's progress snap.
        const glide = animate && this._fraction >= 0 && Math.abs(f - this._fraction) < 0.25;
        this._fraction = f;
        this.fill.remove_transition('scale-x');
        if (glide)
            this.fill.ease({scale_x: f, duration: 600, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        else
            this.fill.scale_x = f;
    }
}

// An image file drawn by St (cover art, a screenshot), cropped to fill.
// (St takes only lengths for background-position; cover centers anyway.)
export function backgroundStyle(path) {
    const uri = GLib.filename_to_uri(path, null).replace(/"/g, '%22');
    return `background-image: url("${uri}"); background-size: cover;`;
}

export function imageStyle(path, width, height, radius = 12) {
    return `${backgroundStyle(path)} width: ${width}px; height: ${height}px; border-radius: ${radius}px;`;
}

// --- apps ----------------------------------------------------------------------

// The app behind a player, from its desktop entry, or its name when the
// entry doesn't match (Spotify's Flatpak says "spotify", its app is
// com.spotify.Client).
export function appFor(entry, name) {
    const apps = Shell.AppSystem.get_default();
    if (entry) {
        const id = entry.endsWith('.desktop') ? entry : `${entry}.desktop`;
        const app = apps.lookup_app(id) ?? apps.lookup_heuristic_basename(id);
        if (app)
            return app;
    }
    for (const term of [entry, name]) {
        const found = term ? Shell.AppSystem.search(term)?.[0]?.[0] : null;
        if (found)
            return apps.lookup_app(found);
    }
    return null;
}

// The app's one-color icon from the theme ("<name>-symbolic"), if it ships
// one.
export function symbolicIcon(app) {
    const gicon = app?.get_icon();
    if (!(gicon instanceof Gio.ThemedIcon))
        return null;
    const theme = new St.IconTheme();
    const name = gicon.get_names().map(n => `${n}-symbolic`).find(n => theme.has_icon(n));
    return name ? new Gio.ThemedIcon({name}) : null;
}

// Black or white, whichever reads on `hex` (#rrggbb).
export function readableOn(hex) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
    if (!m)
        return null;
    const [r, g, b] = [m[1], m[2], m[3]].map(x => parseInt(x, 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#1a1a1a' : '#ffffff';
}

// Paints a colored icon in one color, its own light and dark kept as more
// or less of it: an app icon that ships no symbolic one, shown like one.
// The color is the actor's text color.
export const MonochromeEffect = GObject.registerClass(
class MonochromeEffect extends Shell.GLSLEffect {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, 'uniform vec3 tint;', `
            float a = cogl_color_out.a;
            float l = a > 0.0 ? dot(cogl_color_out.rgb / a, vec3(0.299, 0.587, 0.114)) : 0.0;
            float k = a * (0.4 + 0.6 * l);
            cogl_color_out = vec4(tint * k, k);`, false);
    }

    vfunc_set_actor(actor) {
        if (this._styleId)
            this.actor?.disconnect(this._styleId);
        super.vfunc_set_actor(actor);
        this._styleId = actor?.connect('style-changed', () => this._sync()) ?? 0;
        this._sync();
    }

    _sync() {
        if (!this.actor?.get_stage())
            return;
        const c = this.actor.get_theme_node().get_foreground_color();
        this.set_uniform_float(this.get_uniform_location('tint'), 3, [c.red / 255, c.green / 255, c.blue / 255]);
        this.queue_repaint();
    }
});

// --- marquee -------------------------------------------------------------------

const MARQUEE_GAP = 40;     // px between the end of the text and its copy
const MARQUEE_SPEED = 30;   // px/s
const MARQUEE_PAUSE = 1800; // ms at the start of each round
const MARQUEE_DELAY = 1000; // ms before a single round (the pill settles first)
const MARQUEE_FADE = 20;    // px of fade where the text is cut

// Fades the actor out toward its edges: `left` and `right` are how much of
// its width, from each side, goes from clear to whole.
const FadeEdgesEffect = GObject.registerClass(
class FadeEdgesEffect extends Shell.GLSLEffect {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(Cogl.SnippetHook.FRAGMENT, 'uniform float left; uniform float right;', `
            float x = cogl_tex_coord_in[0].x;
            float k = (left > 0.0 ? clamp(x / left, 0.0, 1.0) : 1.0) *
                (right > 0.0 ? clamp((1.0 - x) / right, 0.0, 1.0) : 1.0);
            cogl_color_out *= k;`, false);
    }

    // In px; none on either side turns it off.
    set(left, right, width) {
        this.enabled = width > 0 && (left > 0 || right > 0);
        if (!this.enabled)
            return;
        this.set_uniform_float(this.get_uniform_location('left'), 1, [left / width]);
        this.set_uniform_float(this.get_uniform_location('right'), 1, [right / width]);
        this.queue_repaint();
    }
});

// As tall as the text; no width of its own (the line is as wide as its
// parent says), or, with `fit`, the text's. The text keeps its natural
// width while it scrolls, or always with `fit`, and is cut to the room
// (ellipsized) otherwise.
const MarqueeLayout = GObject.registerClass(
class MarqueeLayout extends Clutter.LayoutManager {
    vfunc_get_preferred_width() {
        return this.fit ? [0, this.text.get_preferred_width(-1)[1]] : [0, 0];
    }

    vfunc_get_preferred_height(container) {
        return container.get_first_child()?.get_preferred_height(-1) ?? [0, 0];
    }

    vfunc_allocate(container, box) {
        const child = container.get_first_child();
        if (!child)
            return;
        const [, natural] = child.get_preferred_width(-1);
        const width = this.scrolling || this.fit ? natural : Math.min(natural, box.get_width());
        const [, height] = child.get_preferred_height(width);
        child.allocate(new Clutter.ActorBox({x1: box.x1, y1: box.y1, x2: box.x1 + width, y2: box.y1 + height}));
    }
});

// One line of text that scrolls sideways when it doesn't fit (the title of
// One UI's media card): a copy follows it, so a round ends where it began,
// without a jump. Round and round, ellipsized while still (without
// animations or while not shown); or, with `once` (the pill), one round
// each time `play()` asks for it, then it rests on its start, cut with a
// fade instead of "...", and takes the text's width.
export class Marquee {
    constructor(styleClass, {once = false} = {}) {
        this._once = once;
        this._layout = new MarqueeLayout();
        this._layout.fit = once;
        this.actor = new St.Widget({style_class: 'nowpill-marquee', x_expand: !once, clip_to_allocation: true,
            layout_manager: this._layout, ...(once ? {y_align: Clutter.ActorAlign.CENTER} : {})});
        this._strip = hbox({style: `spacing: ${MARQUEE_GAP}px;`});
        this._labels = [0, 1].map(() => {
            const l = label('', styleClass);
            if (once)
                l.clutter_text.ellipsize = 0; // Pango.EllipsizeMode.NONE
            this._strip.add_child(l);
            return l;
        });
        this._layout.text = this._labels[0];
        this._labels[1].visible = false;
        this.actor.add_child(this._strip);
        if (once) {
            this._fade = new FadeEdgesEffect();
            this.actor.add_effect(this._fade);
            this._strip.connect('notify::translation-x', () => this._syncFade());
        }
        this.animate = true;
        this._markup = null;
        this._state = '';
        this._width = 0;
        this._pending = false;
        this._rounding = false;
        this._overflow = false;
        this._distance = 0;
        // Sizes are known after a layout: look then, outside of it.
        this.actor.connect('notify::allocation', () => {
            if (this.actor.width !== this._width) {
                this._width = this.actor.width;
                this._queueCheck();
            }
        });
        this.actor.connect('notify::mapped', () => this._queueCheck());
        this.actor.connect('destroy', () => {
            if (this._checkId)
                GLib.source_remove(this._checkId);
            this._checkId = 0;
        });
    }

    setMarkup(markup) {
        if (markup === this._markup)
            return;
        this._markup = markup;
        for (const l of this._labels)
            l.clutter_text.set_markup(markup);
        // A round going on goes on, unless the text's width changed.
        if (!this._once)
            this._state = '';
        this._queueCheck();
    }

    setText(text) {
        this.setMarkup(GLib.markup_escape_text(text ?? '', -1));
    }

    // `once`: one round, as soon as it is shown, if the text doesn't fit.
    play() {
        this._pending = true;
        this._state = '';
        this._queueCheck();
    }

    _queueCheck() {
        if (this._checkId)
            return;
        this._checkId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._checkId = 0;
            this._check();
            return GLib.SOURCE_REMOVE;
        });
    }

    _check() {
        const [, text] = this._labels[0].get_preferred_width(-1);
        const room = this.actor.width;
        this._overflow = room > 0 && text > room + 1;
        const wanted = !this._once || this._pending || this._rounding;
        const scroll = wanted && this.animate && this.actor.mapped && this._overflow;
        if (room > 0 && (!this._overflow || !this.animate))
            this._pending = false;
        const state = scroll ? `scroll:${text}` : 'still';
        if (state !== this._state) {
            this._state = state;
            this._strip.remove_transition('translation-x');
            this._strip.translation_x = 0;
            this._rounding = false;
            this._labels[1].visible = scroll;
            this._layout.scrolling = scroll;
            this.actor.queue_relayout();
            if (scroll) {
                this._pending = false;
                this._rounding = this._once;
                this._round(text + MARQUEE_GAP);
            }
        }
        this._syncFade();
    }

    // Waits, then slides by one text and gap: the copy is then where the
    // text started, so going back to 0 doesn't show. Once: back at the
    // start, it stays.
    _round(distance) {
        this._distance = distance;
        this._strip.translation_x = 0;
        this._strip.ease({translation_x: -distance, delay: this._once ? MARQUEE_DELAY : MARQUEE_PAUSE,
            duration: distance / MARQUEE_SPEED * 1000, mode: Clutter.AnimationMode.LINEAR,
            onComplete: () => {
                if (!this._once) {
                    this._round(distance);
                    return;
                }
                this._rounding = false;
                this._state = '';
                this._queueCheck();
            }});
    }

    // Cut text fades out at the right; while it slides, at the left too,
    // growing as it leaves the start and shrinking as its copy gets there.
    _syncFade() {
        if (!this._fade)
            return;
        const x = -this._strip.translation_x;
        const left = this._rounding ? Math.max(0, Math.min(MARQUEE_FADE, x, this._distance - x)) : 0;
        this._fade.set(left, this._overflow ? MARQUEE_FADE : 0, this.actor.width);
    }
}

// --- wave slider ---------------------------------------------------------------

const HILLS_HEIGHT = 18; // px above the bar, at the highest, from halfway on
const HILLS_START = 1.5; // how much taller they are at the start of the track
const HILLS_GROW = 36;   // px of played bar under which they grow from flat
const TRACK_GAP = 4;     // px between the handle and what's still to play

// The layers over the played part, back to front, measured from a screen
// recording of One UI 9 (a loop of 1.4 s; it doesn't follow the sound).
// Each spans the whole of it, from the start of the bar to the handle, so
// they stretch, and go faster, as the music goes on. `humps` is how many fit
// in it, and they flow forward: each one is born flat near the start, grows
// as it travels, is at its tallest halfway and shrinks again until it's gone
// at the handle, while the next ones follow. `speed` is how many humps go by
// per second, height a share of HILLS_HEIGHT, `white` how much white goes
// into the bar's color. A hump is never narrower than `width` (px): early
// in the track fewer of them fit, and they split as the bar grows.
const HILLS = [
    {humps: 2, width: 70, height: 1.0, white: 0.1, alpha: 0.85, speed: 0.71},
    {humps: 4, width: 45, height: 0.75, white: 0.5, alpha: 0.55, speed: 1.07},
    {humps: 8, width: 28, height: 0.6, white: 0.9, alpha: 0.65, speed: 1.43},
];

// The hills' motion for `actor`: `amp` eases to 1 while waving and back to
// 0 (sinking them), `time` moves them on; the actor is repainted on each
// frame while there is something to move.
class WaveMotion {
    constructor(actor) {
        this._actor = actor;
        this.amp = 0;
        this.time = 0;
        this._target = 0;
        this._animate = false;
        this._timeline = new Clutter.Timeline({actor, duration: 1000, repeat_count: -1});
        this._timeline.connect('new-frame', () => this._frame());
        actor.connect('notify::mapped', () => this._sync());
        actor.connect('destroy', () => this._timeline.stop());
    }

    set(on, animate) {
        this._animate = animate;
        this._target = on ? 1 : 0;
        if (!animate && this.amp !== this._target) {
            this.amp = this._target;
            this._actor.queue_repaint();
        }
        this._sync();
    }

    _sync() {
        const run = this._animate && this._actor.mapped && (this._target > 0 || this.amp > 0);
        if (run && !this._timeline.is_playing()) {
            this._last = GLib.get_monotonic_time();
            this._timeline.start();
        } else if (!run && this._timeline.is_playing()) {
            this._timeline.stop();
        }
    }

    _frame() {
        const now = GLib.get_monotonic_time();
        const dt = Math.min(0.1, (now - this._last) / 1e6);
        this._last = now;
        this.time += dt * this.amp;
        this.amp += (this._target - this.amp) * (1 - Math.exp(-dt * 5));
        if (Math.abs(this._target - this.amp) < 0.01)
            this.amp = this._target;
        this._actor.queue_repaint();
        if (this.amp === 0)
            this._sync();
    }
}

// The hills standing on the line `y` from `start` to `end`, `height` tall
// at most, in `color` (a Cogl color) faded toward `top`; `alpha` scales
// how opaque they are.
function paintHills(cr, {start, end, y, top, height, motion, color, alpha = 1}) {
    const span = end - start;
    for (const [i, h] of HILLS.entries()) {
        const peak = height * h.height * motion.amp;
        const shift = h.speed * motion.time + i * 0.37;
        const humps = Math.max(0.5, Math.min(h.humps, span / h.width));
        cr.moveTo(start, y);
        for (let x = start; x <= end; x += 2) {
            const t = (x - start) / span;
            // The humps move on, and the envelope sizes them by where
            // they are: born flat at the start, at their tallest
            // halfway, flat again at the end.
            // (Squared: smooth valleys, no cusp where humps meet.)
            const hump = Math.sin(Math.PI * (humps * t - shift)) ** 2;
            const size = Math.pow(Math.sin(Math.PI * t), 1.5);
            cr.lineTo(x, y - peak * size * hump);
        }
        cr.lineTo(end, y);
        cr.closePath();
        const mix = v => (v + (255 - v) * h.white) / 255;
        const grad = new Cairo.LinearGradient(0, top, 0, y);
        grad.addColorStopRGBA(0, mix(color.red), mix(color.green), mix(color.blue), h.alpha * alpha);
        grad.addColorStopRGBA(1, mix(color.red), mix(color.green), mix(color.blue), h.alpha * alpha * 0.45);
        cr.setSource(grad);
        cr.fill();
    }
}

// The shell's slider (drag, keys, scroll) drawn like One UI 9's media seek
// bar: a straight bar, and over the part already played soft translucent
// hills in its color that flow toward the handle while the music plays and
// sink into the bar when it pauses. The handle is the bar's color in a
// white ring.
export const WaveSlider = GObject.registerClass(
class WaveSlider extends Slider.Slider {
    _init(value) {
        super._init(value);
        this._motion = new WaveMotion(this);
    }

    setWaving(on, animate) {
        this._motion.set(on, animate);
    }

    // Room for the hills over the bar; the handle sits on the bar.
    _getPreferredHeight() {
        return Math.ceil(this._handleRadius + this._barLevelHeight / 2 + HILLS_HEIGHT * HILLS_START + 1);
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        if (this.get_text_direction() === Clutter.TextDirection.RTL) {
            cr.translate(width, 0);
            cr.scale(-1, 1);
        }
        const r = this._handleRadius;
        const thick = this._barLevelHeight;
        const y = height - r;
        const handleX = r + (width - 2 * r) * this._value / this._maxValue;
        const start = thick / 2;
        const end = width - thick / 2;
        const c = this._barLevelActiveColor;
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineWidth(thick);

        // Still to play.
        if (handleX + r + TRACK_GAP < end) {
            cr.moveTo(handleX + r + TRACK_GAP, y);
            cr.lineTo(end, y);
            cr.setSourceColor(this._barLevelColor);
            cr.stroke();
        }

        // The hills, standing on the played bar from its start to the handle.
        const span = handleX - start;
        if (this._motion.amp > 0 && span > 2) {
            // Taller early in the track (as in One UI), down to their
            // height by halfway; growing from flat over the first pixels
            // so they aren't spikes.
            const early = 1 + (HILLS_START - 1) * Math.max(0, 1 - 2 * this._value / this._maxValue);
            const grow = Math.min(1, span / HILLS_GROW) * early;
            paintHills(cr, {start, end: handleX, y, top: y - HILLS_HEIGHT * HILLS_START,
                height: HILLS_HEIGHT * grow, motion: this._motion, color: c});
        }

        // Played.
        if (handleX > start) {
            cr.moveTo(start, y);
            cr.lineTo(handleX, y);
            cr.setSourceColor(c);
            cr.stroke();
        }

        cr.setSourceRGBA(1, 1, 1, 1);
        cr.arc(handleX, y, r, 0, 2 * Math.PI);
        cr.fill();
        cr.setSourceColor(c);
        cr.arc(handleX, y, r - 2.5, 0, 2 * Math.PI);
        cr.fill();
        cr.$dispose();
    }
});

// The hills along the whole bottom of a music pill (the lock screen's), as
// on One UI's: they flow while it plays and sink when it pauses. Drawn
// behind the pill's content; the pill's round ends are left clear.
export const PillWave = GObject.registerClass(
class PillWave extends St.DrawingArea {
    _init() {
        super._init({style_class: 'nowpill-pill-wave', x_expand: true, y_expand: true});
        this._motion = new WaveMotion(this);
        this._color = null;
    }

    // `color` #rrggbb (white if none).
    set({playing, color, animate}) {
        if (color !== this._colorHex) {
            const c = Cogl.Color.from_string(color ?? '#ffffff');
            this._colorHex = color;
            this._color = c[0] ? c[1] : null;
            this.queue_repaint();
        }
        this._motion.set(playing, animate);
    }

    vfunc_repaint() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const inset = height / 2;
        if (this._color && this._motion.amp > 0 && width - 2 * inset > 2) {
            paintHills(cr, {start: inset, end: width - inset, y: height, top: height * 0.4,
                height: height * 0.45, motion: this._motion, color: this._color, alpha: 0.7});
        }
        cr.$dispose();
    }
});
