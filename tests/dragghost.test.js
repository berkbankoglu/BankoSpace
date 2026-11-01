// The copy of a subtask (or sub-item) that follows the cursor while it is
// dragged. A small DOM stand-in is enough: the helper only clones, styles,
// places and removes one element.
import { ok, done } from './env.js';

const body = [];
globalThis.document = { ...(globalThis.document || {}), body: { appendChild: (el) => { body.push(el); el.parent = body; } } };

function fakeEl({ rect, attrs = {}, classes = [], vars = {} }) {
  const el = {
    attrs: { ...attrs },
    classes: new Set(classes),
    styleProps: {},
    style: {
      set cssText(v) { el.cssText = v; },
      get cssText() { return el.cssText; },
      setProperty(k, v) { el.styleProps[k] = v; },
      left: '', top: '',
    },
    vars,
    getBoundingClientRect: () => rect,
    removeAttribute(a) { delete el.attrs[a]; },
    classList: { remove: (...c) => c.forEach(x => el.classes.delete(x)), add: (c) => el.classes.add(c) },
    remove() { const i = body.indexOf(el); if (i >= 0) body.splice(i, 1); },
  };
  el.cloneNode = () => fakeEl({ rect, attrs: el.attrs, classes: [...el.classes], vars });
  return el;
}
globalThis.getComputedStyle = (el) => ({ getPropertyValue: (k) => el.vars[k] || '' });

const { startDragGhost } = await import('../src/components/CategoryColumn.jsx');

const src = fakeEl({
  rect: { left: 100, top: 200, width: 320, height: 40 },
  attrs: { 'data-subtask-todoid': '7' },
  classes: ['cc-subtask', 'dragging', 'pressed'],
  vars: { '--todo-font-size': ' 17px', '--subtask-font-size': ' 15px' },
});

const g = startDragGhost(src, { clientX: 130, clientY: 210 });
ok('nothing appears until the pointer actually moves', body.length === 0);

g.move({ clientX: 500, clientY: 600 });
const ghost = body[0];
ok('a copy appears on the first move', body.length === 1 && ghost !== src);
ok('at the box\'s real width', /width:320px/.test(ghost.cssText));
ok('held where it was grabbed (30px in, 10px down)', ghost.style.left === '470px' && ghost.style.top === '590px');
ok('it is not counted as a row or a drop target', !('data-subtask-todoid' in ghost.attrs));
ok('and does not look dimmed like the source', !ghost.classes.has('dragging') && !ghost.classes.has('pressed') && ghost.classes.has('cc-subtask'));
ok('it carries the dashboard\'s font sizes with it', ghost.styleProps['--todo-font-size'] === '17px' && ghost.styleProps['--subtask-font-size'] === '15px');
ok('the pointer passes through it', /pointer-events:none/.test(ghost.cssText));

g.move({ clientX: 510, clientY: 640 });
ok('it follows the cursor', ghost.style.left === '480px' && ghost.style.top === '630px' && body.length === 1);

g.remove();
ok('released: gone', body.length === 0);
g.remove();
ok('removing twice is harmless', body.length === 0);

const none = startDragGhost(null, { clientX: 0, clientY: 0 });
none.move({ clientX: 1, clientY: 1 }); none.remove();
ok('no source element: nothing happens', body.length === 0);
done();
