import { ref, computed } from "vue";
import {
  fetchMe,
  logout as logoutApi,
  isLoggedIn,
  type User,
} from "@/api/authApi";
import { clearToken } from "@/api/client";

export const currentUser = ref<User | null>(null);
export const isAuthenticated = ref(false);
export const isAdmin = computed(() => currentUser.value?.role === "admin");

export async function initAuth(): Promise<void> {
  if (!isLoggedIn()) return;
  try {
    currentUser.value = await fetchMe();
    isAuthenticated.value = true;
  } catch {
    clearToken();
    isAuthenticated.value = false;
    currentUser.value = null;
  }
}

export function setUser(user: User) {
  currentUser.value = user;
  isAuthenticated.value = true;
}

export function doLogout() {
  logoutApi();
  isAuthenticated.value = false;
  currentUser.value = null;
}
