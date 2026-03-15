<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <div class="brand-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 17L7 13L11 15L15 9L21 7"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M15 7H21V13"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h1>StockPilot</h1>
        <p>智能交易助手</p>
      </div>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="handleLogin"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            size="large"
            :prefix-icon="UserIcon"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            show-password
            :prefix-icon="LockIcon"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          class="login-btn"
          :loading="loading"
          @click="handleLogin"
        >
          {{ loading ? "登录中…" : "登 录" }}
        </el-button>
      </el-form>
      <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRouter } from "vue-router";
import { User as UserIcon, Lock as LockIcon } from "@element-plus/icons-vue";
import { login } from "@/api/authApi";
import { setUser } from "@/stores/auth";

const router = useRouter();

const formRef = ref();
const loading = ref(false);
const errorMsg = ref("");

const form = reactive({ username: "", password: "" });
const rules = {
  username: [{ required: true, message: "请输入用户名", trigger: "blur" }],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
};

void UserIcon;
void LockIcon;

async function handleLogin() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }
  loading.value = true;
  errorMsg.value = "";
  try {
    const { user } = await login(form.username, form.password);
    setUser(user);
    router.push("/");
  } catch (e: any) {
    errorMsg.value =
      e?.response?.data?.error || e?.message || "登录失败，请重试";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    135deg,
    rgba(15, 15, 25, 1) 0%,
    rgba(20, 20, 40, 1) 50%,
    rgba(15, 15, 30, 1) 100%
  );
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 2.5rem;
  border-radius: 16px;
  background: rgba(30, 30, 50, 0.8);
  border: 1px solid rgba(99, 102, 241, 0.2);
  backdrop-filter: blur(20px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.login-brand {
  text-align: center;
  margin-bottom: 2rem;
}

.login-brand .brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: linear-gradient(135deg, #6366f1, #3b82f6);
  color: #fff;
  margin-bottom: 0.75rem;
}

.login-brand h1 {
  font-size: 1.75rem;
  font-weight: 700;
  color: #e2e8f0;
  margin: 0;
  letter-spacing: -0.02em;
}

.login-brand p {
  font-size: 0.875rem;
  color: #94a3b8;
  margin: 0.25rem 0 0;
}

.login-btn {
  width: 100%;
  margin-top: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  height: 44px;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  border: none;
}

.login-btn:hover {
  background: linear-gradient(135deg, #818cf8, #6366f1);
}

.login-error {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  font-size: 0.875rem;
  text-align: center;
}

:deep(.el-form-item__label) {
  color: #94a3b8;
  font-weight: 500;
}

:deep(.el-input__wrapper) {
  background: rgba(15, 15, 30, 0.6);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 8px;
  box-shadow: none;
}

:deep(.el-input__wrapper:hover) {
  border-color: rgba(99, 102, 241, 0.35);
}

:deep(.el-input__wrapper.is-focus) {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

@media (max-width: 480px) {
  .login-card {
    margin: 0 1rem;
    padding: 2rem 1.5rem;
  }
}
</style>
