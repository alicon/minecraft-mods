package dev.alicon.narwhaltogether.client;

import java.lang.reflect.Method;
import java.util.Optional;
import net.minecraft.client.Minecraft;

final class ControlifyTeleportShortcut {
	private static final ControlifyChord CHORD = new ControlifyChord();

	private ControlifyTeleportShortcut() {
	}

	static boolean consumeClick(Minecraft client) {
		return client.screen == null && CHORD.consumeClick();
	}

	private static final class ControlifyChord {
		private static final Object PADDLE_1 = ControlifyResourceIds.id("button/paddle1");
		private static final Object RIGHT_STICK = ControlifyResourceIds.id("button/right_stick");
		private final ControlifyAccess controlify = new ControlifyAccess();
		private Object fallbackHoldBinding;
		private Object fallbackTapBinding;
		private Object paddleTapBinding;
		private Method controllerInput;
		private Method inputStateNow;
		private Method inputStateThen;
		private Method isButtonDown;
		private Method bindingOn;
		private Method digitalNow;
		private Method justPressed;

		private boolean consumeClick() {
			if (!this.initialize()) {
				return false;
			}

			try {
				Optional<?> controller = this.controlify.currentController();
				if (controller.isEmpty()) {
					return false;
				}

				return this.rightStickClicked(controller.get())
						|| this.paddleChordPressed(controller.get())
						|| this.fallbackChordPressed(controller.get());
			} catch (ReflectiveOperationException | ClassCastException exception) {
				this.controlify.markUnavailable();
				return false;
			}
		}

		private boolean initialize() {
			if (this.fallbackHoldBinding != null) {
				return true;
			}
			if (!this.controlify.initialize()) {
				return false;
			}

			try {
				this.controllerInput = ControlifyAccess.methodNamed(Class.forName("dev.isxander.controlify.controller.ControllerEntity"), "input", 0);
				this.inputStateNow = ControlifyAccess.methodNamed(Class.forName("dev.isxander.controlify.controller.input.InputComponent"), "stateNow", 0);
				this.inputStateThen = ControlifyAccess.methodNamed(Class.forName("dev.isxander.controlify.controller.input.InputComponent"), "stateThen", 0);
				this.isButtonDown = ControlifyAccess.methodNamed(
						Class.forName("dev.isxander.controlify.controller.input.ControllerStateView"),
						"isButtonDown",
						1
				);
				this.fallbackHoldBinding = this.controlify.binding("CHANGE_PERSPECTIVE");
				this.fallbackTapBinding = this.controlify.binding("OPEN_CHAT");
				this.paddleTapBinding = this.controlify.binding("PICK_BLOCK");
				this.bindingOn = ControlifyAccess.methodNamed(this.fallbackHoldBinding.getClass(), "on", 1);
				Class<?> inputBindingClass = this.bindingOn.getReturnType();
				this.digitalNow = ControlifyAccess.methodNamed(inputBindingClass, "digitalNow", 0);
				this.justPressed = ControlifyAccess.methodNamed(inputBindingClass, "justPressed", 0);
				return true;
			} catch (ReflectiveOperationException | LinkageError exception) {
				this.controlify.markUnavailable();
				return false;
			}
		}

		private boolean rightStickClicked(Object controller) throws ReflectiveOperationException {
			Optional<?> input = (Optional<?>) this.controllerInput.invoke(controller);
			if (input.isEmpty()) {
				return false;
			}

			Object stateNow = this.inputStateNow.invoke(input.get());
			Object stateThen = this.inputStateThen.invoke(input.get());
			return Boolean.TRUE.equals(this.isButtonDown.invoke(stateNow, RIGHT_STICK))
					&& !Boolean.TRUE.equals(this.isButtonDown.invoke(stateThen, RIGHT_STICK));
		}

		private boolean paddleChordPressed(Object controller) throws ReflectiveOperationException {
			Optional<?> input = (Optional<?>) this.controllerInput.invoke(controller);
			if (input.isEmpty()) {
				return false;
			}

			Object stateNow = this.inputStateNow.invoke(input.get());
			Object tap = this.bindingOn.invoke(this.paddleTapBinding, controller);
			return Boolean.TRUE.equals(this.isButtonDown.invoke(stateNow, PADDLE_1))
					&& Boolean.TRUE.equals(this.justPressed.invoke(tap));
		}

		private boolean fallbackChordPressed(Object controller) throws ReflectiveOperationException {
			Object hold = this.bindingOn.invoke(this.fallbackHoldBinding, controller);
			Object tap = this.bindingOn.invoke(this.fallbackTapBinding, controller);
			return Boolean.TRUE.equals(this.digitalNow.invoke(hold))
					&& Boolean.TRUE.equals(this.justPressed.invoke(tap));
		}
	}
}
