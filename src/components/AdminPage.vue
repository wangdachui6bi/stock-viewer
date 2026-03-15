<template>
  <div class="admin-page">
    <div class="admin-container">
      <div class="admin-header">
        <div class="admin-title-row">
          <button class="back-btn" @click="router.push('/')">
            <el-icon><ArrowLeft /></el-icon>
            返回
          </button>
          <h1>用户管理</h1>
          <span class="user-count">共 {{ users.length }} 位用户</span>
        </div>
        <el-button type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>
          添加用户
        </el-button>
      </div>

      <el-skeleton v-if="loading && !users.length" :rows="6" animated />

      <div v-else class="user-grid">
        <div v-for="u in users" :key="u.id" class="user-card" :class="{ 'is-admin': u.role === 'admin' }">
          <div class="user-card-avatar" :class="u.role">
            {{ (u.nickname || u.username).charAt(0).toUpperCase() }}
          </div>
          <div class="user-card-info">
            <div class="user-card-name">
              {{ u.nickname || u.username }}
              <el-tag v-if="u.role === 'admin'" type="danger" size="small" effect="dark" round>管理员</el-tag>
              <el-tag v-else size="small" effect="plain" round>普通用户</el-tag>
            </div>
            <div class="user-card-meta">
              <span class="username">@{{ u.username }}</span>
              <span class="dot">·</span>
              <span>{{ formatDate(u.created_at) }}</span>
            </div>
          </div>
          <div class="user-card-actions">
            <el-dropdown trigger="click" @command="(cmd: string) => handleCommand(cmd, u)">
              <el-button circle size="small">
                <el-icon><MoreFilled /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :command="u.role === 'admin' ? 'demote' : 'promote'">
                    {{ u.role === 'admin' ? '取消管理员' : '设为管理员' }}
                  </el-dropdown-item>
                  <el-dropdown-item command="resetPwd">重置密码</el-dropdown-item>
                  <el-dropdown-item command="delete" divided>
                    <span style="color: var(--el-color-danger)">删除用户</span>
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>

      <el-empty v-if="!loading && !users.length" description="暂无用户" />
    </div>

    <!-- 添加用户 -->
    <el-dialog v-model="createVisible" title="添加用户" width="440px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="formRules" label-position="top">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="字母、数字、下划线，至少2位" maxlength="30" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="至少6位" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="form.nickname" placeholder="可选" maxlength="50" />
        </el-form-item>
        <el-form-item label="角色">
          <el-radio-group v-model="form.role">
            <el-radio value="user">普通用户</el-radio>
            <el-radio value="admin">管理员</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleCreate">确认添加</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="resetPwdVisible" title="重置密码" width="400px" destroy-on-close>
      <p style="margin-bottom: 12px; color: var(--el-text-color-secondary)">
        为用户 <b>{{ resetTarget?.username }}</b> 设置新密码
      </p>
      <el-form label-position="top">
        <el-form-item label="新密码">
          <el-input v-model="resetPwdValue" type="password" show-password placeholder="至少6位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleResetPwd">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { ArrowLeft, Plus, MoreFilled } from "@element-plus/icons-vue";
import {
  fetchUsers,
  createUser,
  updateUserRole,
  resetUserPassword,
  deleteUser,
  type AdminUser,
} from "@/api/adminApi";

const router = useRouter();

const users = ref<AdminUser[]>([]);
const loading = ref(false);
const submitting = ref(false);

const createVisible = ref(false);
const formRef = ref();
const form = ref({ username: "", password: "", nickname: "", role: "user" });
const formRules = {
  username: [
    { required: true, message: "请输入用户名", trigger: "blur" },
    { min: 2, message: "至少2个字符", trigger: "blur" },
    { pattern: /^[a-zA-Z0-9_\-]+$/, message: "只允许字母、数字、下划线、连字符", trigger: "blur" },
  ],
  password: [
    { required: true, message: "请输入密码", trigger: "blur" },
    { min: 6, message: "至少6位", trigger: "blur" },
  ],
};

const resetPwdVisible = ref(false);
const resetTarget = ref<AdminUser | null>(null);
const resetPwdValue = ref("");

async function loadUsers() {
  loading.value = true;
  try {
    users.value = await fetchUsers();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "加载用户列表失败");
  } finally {
    loading.value = false;
  }
}

function openCreateDialog() {
  form.value = { username: "", password: "", nickname: "", role: "user" };
  createVisible.value = true;
}

async function handleCreate() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }
  submitting.value = true;
  try {
    await createUser(form.value);
    ElMessage.success("用户添加成功");
    createVisible.value = false;
    loadUsers();
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "添加失败");
  } finally {
    submitting.value = false;
  }
}

async function handleCommand(cmd: string, user: AdminUser) {
  if (cmd === "promote" || cmd === "demote") {
    const newRole = cmd === "promote" ? "admin" : "user";
    const label = cmd === "promote" ? "设为管理员" : "取消管理员";
    try {
      await ElMessageBox.confirm(`确认将 ${user.username} ${label}？`, "提示");
    } catch {
      return;
    }
    try {
      await updateUserRole(user.id, newRole);
      ElMessage.success("角色已更新");
      loadUsers();
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.error || "操作失败");
    }
  } else if (cmd === "resetPwd") {
    resetTarget.value = user;
    resetPwdValue.value = "";
    resetPwdVisible.value = true;
  } else if (cmd === "delete") {
    try {
      await ElMessageBox.confirm(
        `确认删除用户 ${user.username}？此操作不可恢复。`,
        "危险操作",
        { type: "warning", confirmButtonText: "确认删除", confirmButtonClass: "el-button--danger" },
      );
    } catch {
      return;
    }
    try {
      await deleteUser(user.id);
      ElMessage.success("用户已删除");
      loadUsers();
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.error || "删除失败");
    }
  }
}

async function handleResetPwd() {
  if (!resetTarget.value) return;
  if (!resetPwdValue.value || resetPwdValue.value.length < 6) {
    ElMessage.warning("密码至少6位");
    return;
  }
  submitting.value = true;
  try {
    await resetUserPassword(resetTarget.value.id, resetPwdValue.value);
    ElMessage.success("密码已重置");
    resetPwdVisible.value = false;
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.error || "重置失败");
  } finally {
    submitting.value = false;
  }
}

function formatDate(dt: string) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

onMounted(() => loadUsers());
</script>

<style scoped>
.admin-page {
  min-height: 100vh;
  padding: 2rem;
  background: linear-gradient(
    160deg,
    rgba(15, 15, 25, 1) 0%,
    rgba(20, 18, 38, 1) 50%,
    rgba(12, 14, 28, 1) 100%
  );
}

.admin-container {
  max-width: 860px;
  margin: 0 auto;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.admin-title-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.admin-title-row h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: #e2e8f0;
  margin: 0;
}

.user-count {
  font-size: 0.85rem;
  color: #64748b;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.85rem;
  border-radius: 8px;
  border: 1px solid rgba(99, 102, 241, 0.25);
  background: rgba(99, 102, 241, 0.08);
  color: #a5b4fc;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}

.back-btn:hover {
  background: rgba(99, 102, 241, 0.18);
  border-color: rgba(99, 102, 241, 0.45);
}

.user-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  background: rgba(30, 30, 52, 0.7);
  border: 1px solid rgba(99, 102, 241, 0.1);
  transition: all 0.2s;
}

.user-card:hover {
  border-color: rgba(99, 102, 241, 0.25);
  background: rgba(35, 35, 60, 0.8);
}

.user-card.is-admin {
  border-color: rgba(239, 68, 68, 0.2);
  background: rgba(35, 25, 35, 0.7);
}

.user-card.is-admin:hover {
  border-color: rgba(239, 68, 68, 0.35);
}

.user-card-avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
}

.user-card-avatar.admin {
  background: linear-gradient(135deg, #ef4444, #dc2626);
}

.user-card-info {
  flex: 1;
  min-width: 0;
}

.user-card-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 0.2rem;
}

.user-card-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: #64748b;
}

.user-card-meta .username {
  color: #818cf8;
}

.user-card-meta .dot {
  color: #475569;
}

.user-card-actions {
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .admin-page {
    padding: 1rem;
  }
  .admin-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .user-card {
    padding: 0.85rem 1rem;
  }
}
</style>
