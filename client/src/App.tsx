import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ProtectedRoute } from "@/components/protected-route";
import { Layout } from "@/components/layout";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import UploadFood from "@/pages/upload-food";
import Tracker from "@/pages/tracker";
import Profile from "@/pages/profile";
import Chatbot from "@/pages/chatbot";
import NotFound from "@/pages/not-found";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function Router() {
  return (
    <Switch>
      <Route path="/">
        {() => <Redirect to="/dashboard" />}
      </Route>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard">
        {() => (
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/upload">
        {() => (
          <ProtectedRoute>
            <Layout>
              <UploadFood />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tracker">
        {() => (
          <ProtectedRoute>
            <Layout>
              <Tracker />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/profile">
        {() => (
          <ProtectedRoute>
            <Layout>
              <Profile />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/chatbot">
        {() => (
          <ProtectedRoute>
            <Layout>
              <Chatbot />
            </Layout>
          </ProtectedRoute>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <ToastContainer
              position="top-right"
              autoClose={3000}
              hideProgressBar={false}
              newestOnTop
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="light"
            />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
