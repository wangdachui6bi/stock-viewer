import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import App from "./App.vue";
import router from "./router";
import { initAuth } from "./stores/auth";
import "./styles/main.css";

document.documentElement.classList.add("dark");

async function bootstrap() {
  await initAuth();
  const app = createApp(App);
  app.use(ElementPlus);
  app.use(router);
  app.mount("#app");
}

bootstrap();
