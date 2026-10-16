import React, { useState } from "react";
import {
  Film,
  Lock,
  Mail,
  User as UserIcon,
  Eye,
  EyeOff,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "../hooks/useAuth";
import { AuthLayout } from "./AuthLayout";

interface SignupScreenProps {
  onNavigateToLogin: () => void;
  onSuccess: () => void;
  onBack?: () => void;
}

export const SignupScreen: React.FC<SignupScreenProps> = ({
  onNavigateToLogin,
  onSuccess,
  onBack,
}) => {
  const { login } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(true);

  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDisplayNameError(null);
    setEmailError(null);
    setPasswordError(null);
    setFormError(null);

    let hasClientError = false;

    if (displayName.trim().length < 2 || displayName.trim().length > 30) {
      setDisplayNameError("Display name must be between 2 and 30 characters.");
      hasClientError = true;
    }

    if (!email.includes("@") || email.trim().length < 5) {
      setEmailError("Please enter a valid email address.");
      hasClientError = true;
    }

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      hasClientError = true;
    }

    if (!agreedTerms) {
      setFormError("Please confirm you have permission to share your media.");
      hasClientError = true;
    }

    if (hasClientError) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setEmailError("That email is already registered");
        } else {
          setFormError(data.error || "Failed to create account.");
        }
        return;
      }

      login(data.user);
      onSuccess();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout onBack={onBack}>
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Brand header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-violet-600/30">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              WatchRoom
            </h1>
            <p className="text-xs text-violet-400">
              Synchronized Watch Parties
            </p>
          </div>
        </div>

        <Card className="w-full bg-[#131722]/90 border-white/10 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-xl font-bold text-white">
              Your seat is waiting.
            </CardTitle>
            <CardDescription className="text-gray-400 text-xs">
              Sign up to host rooms, save playlists, and watch together
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div
                  role="alert"
                  className="p-3 text-xs bg-red-950/60 border border-red-500/40 text-red-300 rounded-lg animate-in fade-in"
                >
                  {formError}
                </div>
              )}

              {/* Display Name */}
              <div className="space-y-1.5">
                <label
                  htmlFor="signup-name"
                  className="text-xs font-medium text-gray-300 flex items-center gap-1.5"
                >
                  <UserIcon className="w-3.5 h-3.5 text-violet-400" />
                  <span>Display Name</span>
                </label>
                <Input
                  id="signup-name"
                  autoComplete="nickname"
                  type="text"
                  required
                  placeholder="e.g. Alex"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={`bg-[#0b0d12] text-white placeholder:text-gray-600 focus:border-violet-500 ${
                    displayNameError ? "border-red-500" : "border-white/10"
                  }`}
                />
                {displayNameError && (
                  <p className="text-[11px] text-red-400">{displayNameError}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label
                  htmlFor="signup-email"
                  className="text-xs font-medium text-gray-300 flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5 text-violet-400" />
                  <span>Email address</span>
                </label>
                <Input
                  id="signup-email"
                  autoComplete="email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`bg-[#0b0d12] text-white placeholder:text-gray-600 focus:border-violet-500 ${
                    emailError ? "border-red-500" : "border-white/10"
                  }`}
                />
                {emailError && (
                  <p className="text-[11px] text-red-400">{emailError}</p>
                )}
              </div>

              {/* Password with show/hide and strength hint */}
              <div className="space-y-1.5">
                <label
                  htmlFor="signup-password"
                  className="text-xs font-medium text-gray-300 flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5 text-violet-400" />
                  <span>Password</span>
                </label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    autoComplete="new-password"
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`bg-[#0b0d12] text-white pr-10 placeholder:text-gray-600 focus:border-violet-500 ${
                      passwordError ? "border-red-500" : "border-white/10"
                    }`}
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {passwordError ? (
                  <p className="text-[11px] text-red-400">{passwordError}</p>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    At least 8 characters
                  </p>
                )}
              </div>

              {/* Terms checkbox text (no link needed per spec 9) */}
              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="terms"
                  checked={agreedTerms}
                  onCheckedChange={(checked) => setAgreedTerms(!!checked)}
                />
                <label
                  htmlFor="terms"
                  className="text-xs text-gray-400 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  I will only share media I have permission to stream
                </label>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold h-12 mt-2 shadow-lg shadow-violet-600/25"
              >
                <span>
                  {submitting ? "Creating account…" : "Create Account"}
                </span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>

            <div className="mt-6 text-center text-xs text-gray-400 border-t border-white/5 pt-4">
              Already have an account?{" "}
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="text-violet-400 hover:text-violet-300 font-medium underline underline-offset-4 ml-1"
              >
                Sign In
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthLayout>
  );
};
