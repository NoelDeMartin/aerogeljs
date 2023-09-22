import type { RouteRecordRaw } from 'vue-router';

import Components from './Components.vue';
import Content from './Content.vue';
import Forms from './Forms.vue';
import Home from './Home.vue';
import Modals from './modals/Modals.vue';
import Offline from './offline/Offline.vue';
import Solid from './solid/Solid.vue';
import Storage from './Storage.vue';

export const routes: RouteRecordRaw[] = [
    {
        name: 'home',
        path: '/',
        component: Home,
    },
    {
        name: 'components',
        path: '/components',
        component: Components,
    },
    {
        name: 'content',
        path: '/content',
        component: Content,
    },
    {
        name: 'forms',
        path: '/forms',
        component: Forms,
    },
    {
        name: 'modals',
        path: '/modals',
        component: Modals,
    },
    {
        name: 'storage',
        path: '/storage',
        component: Storage,
    },
    {
        name: 'solid',
        path: '/solid',
        component: Solid,
    },
    {
        name: 'offline',
        path: '/offline',
        component: Offline,
    },
];
