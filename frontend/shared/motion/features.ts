import { domMax } from 'motion/react';

/// The animation engine, loaded after the page. Every animated element is an
/// `m` component, which draws at once and starts moving when this arrives;
/// domMax because the nav pills slide between tabs with layoutId.
export default domMax;
