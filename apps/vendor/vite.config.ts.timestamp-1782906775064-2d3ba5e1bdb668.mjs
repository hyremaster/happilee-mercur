// vite.config.ts
import { defineConfig, loadEnv } from "file:///home/adhithya-shanil/Marketplace(Mercur)/happilee-mercur/node_modules/.bun/vite@5.4.21+9c2bf2c5af70e57b/node_modules/vite/dist/node/index.js";
import react from "file:///home/adhithya-shanil/Marketplace(Mercur)/happilee-mercur/node_modules/.bun/@vitejs+plugin-react@4.7.0+b7148e191eb7f852/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///home/adhithya-shanil/Marketplace(Mercur)/happilee-mercur/node_modules/.bun/@tailwindcss+vite@4.3.1+b7148e191eb7f852/node_modules/@tailwindcss/vite/dist/index.mjs";
import { resolve } from "path";
import { mercurDashboardPlugin } from "file:///home/adhithya-shanil/Marketplace(Mercur)/happilee-mercur/packages/dashboard-sdk/dist/index.cjs";
var __vite_injected_original_dirname = "/home/adhithya-shanil/Marketplace(Mercur)/happilee-mercur/apps/vendor";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_MERCUR_BACKEND_URL || env.MERCUR_BACKEND_URL;
  const vendorRoot = resolve(__vite_injected_original_dirname, "../../packages/vendor");
  const vendorSrc = resolve(vendorRoot, "src");
  const useVendorSource = mode === "development";
  const vendorSourceAliases = useVendorSource ? {
    "@mercurjs/vendor/index.css": resolve(vendorSrc, "index.css"),
    "@mercurjs/vendor": resolve(vendorSrc, "index.ts"),
    "@components": resolve(vendorSrc, "components"),
    "@hooks": resolve(vendorSrc, "hooks"),
    "@lib": resolve(vendorSrc, "lib"),
    "@pages": resolve(vendorSrc, "pages"),
    "@providers": resolve(vendorSrc, "providers"),
    "@assets": resolve(vendorSrc, "assets")
  } : {};
  return {
    plugins: [
      react(),
      tailwindcss(),
      mercurDashboardPlugin({
        medusaConfigPath: "../api/medusa-config.ts",
        ...backendUrl ? { backendUrl } : {},
        components: {
          StoreSetup: "components/store-setup/store-setup"
        }
      })
    ],
    resolve: {
      alias: {
        "@": vendorSrc,
        ...vendorSourceAliases
      }
    },
    optimizeDeps: {
      include: [
        "@happilee-app/ui",
        "@happilee-app/ui/ecommerce",
        "@happilee-app/icons"
      ]
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9hZGhpdGh5YS1zaGFuaWwvTWFya2V0cGxhY2UoTWVyY3VyKS9oYXBwaWxlZS1tZXJjdXIvYXBwcy92ZW5kb3JcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL2FkaGl0aHlhLXNoYW5pbC9NYXJrZXRwbGFjZShNZXJjdXIpL2hhcHBpbGVlLW1lcmN1ci9hcHBzL3ZlbmRvci92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9hZGhpdGh5YS1zaGFuaWwvTWFya2V0cGxhY2UoTWVyY3VyKS9oYXBwaWxlZS1tZXJjdXIvYXBwcy92ZW5kb3Ivdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcsIGxvYWRFbnYgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuaW1wb3J0IHRhaWx3aW5kY3NzIGZyb20gJ0B0YWlsd2luZGNzcy92aXRlJ1xuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gJ3BhdGgnXG5pbXBvcnQgeyBtZXJjdXJEYXNoYm9hcmRQbHVnaW4gfSBmcm9tICdAbWVyY3VyanMvZGFzaGJvYXJkLXNkaydcblxuLy8gaHR0cHM6Ly92aXRlLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoKHsgbW9kZSB9KSA9PiB7XG4gIGNvbnN0IGVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSwgJycpXG4gIGNvbnN0IGJhY2tlbmRVcmwgPVxuICAgIGVudi5WSVRFX01FUkNVUl9CQUNLRU5EX1VSTCB8fCBlbnYuTUVSQ1VSX0JBQ0tFTkRfVVJMXG4gIGNvbnN0IHZlbmRvclJvb3QgPSByZXNvbHZlKF9fZGlybmFtZSwgJy4uLy4uL3BhY2thZ2VzL3ZlbmRvcicpXG4gIGNvbnN0IHZlbmRvclNyYyA9IHJlc29sdmUodmVuZG9yUm9vdCwgJ3NyYycpXG4gIGNvbnN0IHVzZVZlbmRvclNvdXJjZSA9IG1vZGUgPT09ICdkZXZlbG9wbWVudCdcblxuICBjb25zdCB2ZW5kb3JTb3VyY2VBbGlhc2VzID0gdXNlVmVuZG9yU291cmNlXG4gICAgPyB7XG4gICAgICAgICdAbWVyY3VyanMvdmVuZG9yL2luZGV4LmNzcyc6IHJlc29sdmUodmVuZG9yU3JjLCAnaW5kZXguY3NzJyksXG4gICAgICAgICdAbWVyY3VyanMvdmVuZG9yJzogcmVzb2x2ZSh2ZW5kb3JTcmMsICdpbmRleC50cycpLFxuICAgICAgICAnQGNvbXBvbmVudHMnOiByZXNvbHZlKHZlbmRvclNyYywgJ2NvbXBvbmVudHMnKSxcbiAgICAgICAgJ0Bob29rcyc6IHJlc29sdmUodmVuZG9yU3JjLCAnaG9va3MnKSxcbiAgICAgICAgJ0BsaWInOiByZXNvbHZlKHZlbmRvclNyYywgJ2xpYicpLFxuICAgICAgICAnQHBhZ2VzJzogcmVzb2x2ZSh2ZW5kb3JTcmMsICdwYWdlcycpLFxuICAgICAgICAnQHByb3ZpZGVycyc6IHJlc29sdmUodmVuZG9yU3JjLCAncHJvdmlkZXJzJyksXG4gICAgICAgICdAYXNzZXRzJzogcmVzb2x2ZSh2ZW5kb3JTcmMsICdhc3NldHMnKSxcbiAgICAgIH1cbiAgICA6IHt9XG5cbiAgcmV0dXJuIHtcbiAgICBwbHVnaW5zOiBbXG4gICAgICByZWFjdCgpLFxuICAgICAgdGFpbHdpbmRjc3MoKSxcbiAgICAgIG1lcmN1ckRhc2hib2FyZFBsdWdpbih7XG4gICAgICAgIG1lZHVzYUNvbmZpZ1BhdGg6ICcuLi9hcGkvbWVkdXNhLWNvbmZpZy50cycsXG4gICAgICAgIC4uLihiYWNrZW5kVXJsID8geyBiYWNrZW5kVXJsIH0gOiB7fSksXG4gICAgICAgIGNvbXBvbmVudHM6IHtcbiAgICAgICAgICBTdG9yZVNldHVwOiAnY29tcG9uZW50cy9zdG9yZS1zZXR1cC9zdG9yZS1zZXR1cCcsXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICBdLFxuICAgIHJlc29sdmU6IHtcbiAgICAgIGFsaWFzOiB7XG4gICAgICAgICdAJzogdmVuZG9yU3JjLFxuICAgICAgICAuLi52ZW5kb3JTb3VyY2VBbGlhc2VzLFxuICAgICAgfSxcbiAgICB9LFxuICAgIG9wdGltaXplRGVwczoge1xuICAgICAgaW5jbHVkZTogW1xuICAgICAgICAnQGhhcHBpbGVlLWFwcC91aScsXG4gICAgICAgICdAaGFwcGlsZWUtYXBwL3VpL2Vjb21tZXJjZScsXG4gICAgICAgICdAaGFwcGlsZWUtYXBwL2ljb25zJyxcbiAgICAgIF0sXG4gICAgfSxcbiAgfVxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBaVksU0FBUyxjQUFjLGVBQWU7QUFDdmEsT0FBTyxXQUFXO0FBQ2xCLE9BQU8saUJBQWlCO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLDZCQUE2QjtBQUp0QyxJQUFNLG1DQUFtQztBQU96QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUN4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFDM0MsUUFBTSxhQUNKLElBQUksMkJBQTJCLElBQUk7QUFDckMsUUFBTSxhQUFhLFFBQVEsa0NBQVcsdUJBQXVCO0FBQzdELFFBQU0sWUFBWSxRQUFRLFlBQVksS0FBSztBQUMzQyxRQUFNLGtCQUFrQixTQUFTO0FBRWpDLFFBQU0sc0JBQXNCLGtCQUN4QjtBQUFBLElBQ0UsOEJBQThCLFFBQVEsV0FBVyxXQUFXO0FBQUEsSUFDNUQsb0JBQW9CLFFBQVEsV0FBVyxVQUFVO0FBQUEsSUFDakQsZUFBZSxRQUFRLFdBQVcsWUFBWTtBQUFBLElBQzlDLFVBQVUsUUFBUSxXQUFXLE9BQU87QUFBQSxJQUNwQyxRQUFRLFFBQVEsV0FBVyxLQUFLO0FBQUEsSUFDaEMsVUFBVSxRQUFRLFdBQVcsT0FBTztBQUFBLElBQ3BDLGNBQWMsUUFBUSxXQUFXLFdBQVc7QUFBQSxJQUM1QyxXQUFXLFFBQVEsV0FBVyxRQUFRO0FBQUEsRUFDeEMsSUFDQSxDQUFDO0FBRUwsU0FBTztBQUFBLElBQ0wsU0FBUztBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLE1BQ1osc0JBQXNCO0FBQUEsUUFDcEIsa0JBQWtCO0FBQUEsUUFDbEIsR0FBSSxhQUFhLEVBQUUsV0FBVyxJQUFJLENBQUM7QUFBQSxRQUNuQyxZQUFZO0FBQUEsVUFDVixZQUFZO0FBQUEsUUFDZDtBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0g7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLE9BQU87QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMLEdBQUc7QUFBQSxNQUNMO0FBQUEsSUFDRjtBQUFBLElBQ0EsY0FBYztBQUFBLE1BQ1osU0FBUztBQUFBLFFBQ1A7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
