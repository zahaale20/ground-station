import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";

function RequireAuth() {
  const { status } = useAuth();
  if (status === "unknown") {
    return (
      <div className="grid h-full place-items-center text-slate-400 text-sm">
        Checking session…
      </div>
    );
  }
  if (status === "anonymous") {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

function RedirectIfAuthed() {
  const { status } = useAuth();
  if (status === "authed") return <Navigate to="/" replace />;
  return <Login />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <RedirectIfAuthed /> },
  {
    path: "/",
    element: <RequireAuth />,
    children: [{ index: true, element: <Dashboard /> }],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
