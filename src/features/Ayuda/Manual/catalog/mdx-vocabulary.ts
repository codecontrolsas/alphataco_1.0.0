/**
 * Componentes que se pueden usar dentro de una guía `.mdx`. El validador rechaza cualquier otro
 * (un `<Callot>` mal escrito se vería como texto crudo en pantalla), y el mapa de componentes del
 * renderizado está tipado contra esta lista, así que no pueden divergir.
 */
export const MDX_COMPONENT_NAMES = [
  'Callout',
  'Steps',
  'Step',
  'OpenScreen',
  'GuideLink',
  'Flow',
  'FlowStep',
  'States',
  'State',
  'Kbd',
  'Figure',
] as const;

export type MdxComponentName = (typeof MDX_COMPONENT_NAMES)[number];
