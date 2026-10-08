import { defineSection, tab } from '../define.ts';

export const generalSection = defineSection({
  key: 'general',
  title: 'General',
  description: 'Primeros pasos, cómo moverse por el sistema, glosario y preguntas frecuentes.',
  icon: 'start',
  guides: [
    {
      slug: 'primeros-pasos',
      related: ['empresa-usuarios-y-permisos', 'como-usar-el-manual', 'glosario'],
    },
    {
      slug: 'como-usar-el-manual',
      access: [tab('ayuda', 'manual')],
      screens: [{ path: '/dashboard/help', tab: 'manual' }],
      related: ['primeros-pasos', 'glosario', 'preguntas-frecuentes'],
    },
    {
      slug: 'empresa-usuarios-y-permisos',
      related: ['usuarios-y-roles', 'primeros-pasos', 'preguntas-frecuentes'],
    },
    {
      slug: 'glosario',
      related: ['preguntas-frecuentes', 'primeros-pasos', 'almacenes'],
    },
    {
      slug: 'preguntas-frecuentes',
      related: ['glosario', 'empresa-usuarios-y-permisos', 'soporte-tickets'],
    },
  ],
});
