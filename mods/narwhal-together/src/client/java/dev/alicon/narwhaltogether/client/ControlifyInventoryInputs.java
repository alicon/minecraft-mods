package dev.alicon.narwhaltogether.client;

import java.lang.reflect.Method;
import java.util.Optional;

record ControlifyInventoryPresses(boolean select, boolean quickMove) {
	static final ControlifyInventoryPresses NONE = new ControlifyInventoryPresses(false, false);
}

final class ControlifyInventoryInputs {
	private final ControlifyAccess controlify = new ControlifyAccess();
	private Object selectBinding;
	private Object quickMoveBinding;
	private Method bindingOn;
	private Method justPressed;

	ControlifyInventoryPresses poll() {
		if (!initialize()) {
			return ControlifyInventoryPresses.NONE;
		}

		try {
			Optional<?> controller = this.controlify.currentController();
			if (controller.isEmpty()) {
				return ControlifyInventoryPresses.NONE;
			}

			return new ControlifyInventoryPresses(
					this.isJustPressed(this.selectBinding, controller.get()),
					this.isJustPressed(this.quickMoveBinding, controller.get())
			);
		} catch (ReflectiveOperationException | ClassCastException exception) {
			this.controlify.markUnavailable();
			return ControlifyInventoryPresses.NONE;
		}
	}

	private boolean initialize() {
		if (this.selectBinding != null) {
			return true;
		}
		if (!this.controlify.initialize()) {
			return false;
		}

		try {
			this.selectBinding = this.controlify.binding("INV_SELECT");
			this.quickMoveBinding = this.controlify.binding("INV_QUICK_MOVE");
			this.bindingOn = ControlifyAccess.methodNamed(this.selectBinding.getClass(), "on", 1);
			this.justPressed = ControlifyAccess.methodNamed(this.bindingOn.getReturnType(), "justPressed", 0);
			return true;
		} catch (ReflectiveOperationException | LinkageError exception) {
			this.controlify.markUnavailable();
			return false;
		}
	}

	private boolean isJustPressed(Object binding, Object controller) throws ReflectiveOperationException {
		Object controllerBinding = this.bindingOn.invoke(binding, controller);
		return Boolean.TRUE.equals(this.justPressed.invoke(controllerBinding));
	}
}
