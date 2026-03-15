import { createRouter, createWebHistory } from "vue-router";
import { isAuthenticated, isAdmin } from "@/stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/components/LoginPage.vue"),
      meta: { guest: true },
    },
    {
      path: "/admin",
      name: "admin",
      component: () => import("@/components/AdminPage.vue"),
      meta: { requiresAdmin: true },
    },
    {
      path: "/",
      name: "home",
      component: () => import("@/views/HomeView.vue"),
    },
  ],
});

router.beforeEach((to) => {
  if (to.meta.guest) {
    return isAuthenticated.value ? { name: "home" } : undefined;
  }
  if (!isAuthenticated.value) {
    return { name: "login" };
  }
  if (to.meta.requiresAdmin && !isAdmin.value) {
    return { name: "home" };
  }
});

export default router;
