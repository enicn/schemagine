<script setup lang="ts">
// 媒体库管理页演示（docs/17 模式四）：内存版 IMediaService 全能力实现 + MediaLibrary 组件
import { setMediaService } from '@/services/api/mediaService'
import { mockMediaService, resetMockMedia } from '@/services/mock/mockMediaService'
import { MediaLibrary } from '@/media'

// 子组件 onMounted 先于父组件触发：服务注入必须放在 setup 同步段（宿主对接同理）
resetMockMedia()
setMediaService(mockMediaService)
</script>

<template>
  <div class="media-library-demo">
    <h2 class="media-library-demo__title">媒体库（MediaLibrary 组件演示）</h2>
    <MediaLibrary />
  </div>
</template>

<style scoped>
.media-library-demo {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px;
}
.media-library-demo__title {
  margin: 0 0 16px;
  font-size: 18px;
}
</style>
