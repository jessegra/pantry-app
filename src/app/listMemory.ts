import type { Location } from 'react-router-dom';

const HOME: Location = { pathname: '/', search: '', hash: '', state: null, key: 'default' };

/** Tablet: the list screen the left pane keeps showing while an item is open on the right. */
let last: Location = HOME;

export const lastListLocation = () => last;
export const rememberListLocation = (location: Location) => {
  last = location;
};
/** Test hook. */
export const forgetListLocation = () => {
  last = HOME;
};
